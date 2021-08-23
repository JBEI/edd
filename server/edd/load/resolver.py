import collections
import json
import logging
import math
import typing

from django.conf import settings
from django.core.exceptions import MultipleObjectsReturned, ValidationError
from django.db.models import Count, Q
from django.utils.translation import gettext_lazy as _

from edd.utilities import JSONEncoder
from main import models

from . import exceptions, reporting
from .broker import ImportBroker, LoadRequest
from .parsers import MeasurementParseRecord, ParseResult, build_src_summary

logger = logging.getLogger(__name__)

# aliases
ConflictSummary = exceptions.ImportConflictWarning.ConflictSummary


class TypeResolver:
    """Finds a measurement type to match tokens in data loading request."""

    def __init__(self, user, category):
        self.user = user
        self.category = category

    def lookup_type(self, token):
        if not self.category.type_group:
            # best try to match, fail if none found
            return self._broad_measurement_type_lookup(token)
        elif self.category.type_group == models.MeasurementType.Group.GENERIC:
            return self._generic_measurement_type_lookup(token)
        elif self.category.type_group == models.MeasurementType.Group.METABOLITE:
            return models.Metabolite.load_or_create(str(token))
        elif self.category.type_group == models.MeasurementType.Group.PROTEINID:
            return models.ProteinIdentifier.load_or_create(str(token), self.user)
        elif self.category.type_group == models.MeasurementType.Group.GENEID:
            return models.GeneIdentifier.load_or_create(str(token), self.user)
        # not supporting any other types at this time
        raise ValidationError("Failed to match measurement type")

    def _broad_measurement_type_lookup(self, mtype_id):
        # check type_name first
        try:
            return models.MeasurementType.objects.get(type_name=mtype_id)
        except models.MeasurementType.DoesNotExist:
            # ok, no name match, keep trying below before failing
            pass
        except MultipleObjectsReturned as e:
            raise ValidationError(
                f'Multiple Measurement Types found matching "{mtype_id}"'
            ) from e
        # if not that, check for PubChem pattern
        try:
            return models.Metabolite.load_or_create(str(mtype_id))
        except ValidationError:
            # ok, not a PubChem ID, keep trying below
            pass
        # maybe it's a UniProt pattern
        try:
            return models.ProteinIdentifier.load_or_create(str(mtype_id), self.user)
        except ValidationError:
            pass
        # everything so far failed, time to give up
        # GeneIdentifier should get caught by first try block
        # not attempting GeneIdentifier.load_or_create()
        # because it will *always* generate an identifier
        raise ValidationError(f'Measurement Type "{mtype_id}" not found')

    def _generic_measurement_type_lookup(self, mtype_id):
        # For now, we purposefully avoid filtering by
        # type_group=Measurementype.Group.GENERIC
        # to allow for bioreactors that contain multiple classes of MeasurementTypes
        try:
            return models.MeasurementType.objects.get(type_name=mtype_id)
        except models.MeasurementType.DoesNotExist:
            raise ValidationError(f'Measurement Type "{mtype_id}" not found')
        except MultipleObjectsReturned:
            raise ValidationError(
                f'Multiple Measurement Types found matching "{mtype_id}"'
            )


class ImportResolver:
    """
    Resolves parsed file content against EDD and other reference databases.

    This includes matching line/assay names from the file against the EDD study, matching
    MeasurementType and unit identifiers against EDD and/or external references, and testing
    that any inputs required to complete the import are either provided in the file, via direct
    input during the import (where supported) or found in the study (e.g. assay time metadata
    for Skyline).
    """

    def __init__(self, load: LoadRequest, parsed: ParseResult):
        super().__init__()
        self.load = load
        self.parsed = parsed

        self._assay_time_error: bool = False
        self._assay_time_metatype = models.MetadataType.system("Time")

        # maps type identifier strings to model objects
        self._mtype_name_to_type: typing.Dict[str, models.MeasurementType] = {}
        # maps line or assay name to the model object pk
        self._loa_name_to_pk: typing.Dict[str, int] = {}
        # maps assay name to existing line pk, only if file contained assay names
        self._assay_name_to_line_pk: typing.Dict[str, int] = {}
        # maps assay pk -> time read from assay metadata (Skyline workflow). Only used when
        # matched_assays is True. Using vector time to match MeasurementValue.x.
        self._assay_pk_to_time: typing.Dict[int, typing.List[float]] = {}
        self._unit_name_to_unit: typing.Dict[str, int] = {}

    def resolve(self, type_resolver):
        """
        Resolves content tokens against EDD and external databases.

        Builds up a context object to map tokens appearing in a data loading
        request, to database records or other identifiers. If all the tokens in
        a loading request can get resolved, the importing process can be
        completed. If this method returns without raising an exception, the
        LoadRequest has either been marked RESOLVED or READY.

        Basic steps are:

        1) Resolve Line/Assay/MeasurementType/MeasurementUnit identifiers from
            the LoadRequest to known references
        2) Test whether sufficient inputs are provided to complete the import.
            For example, measurement times in the Skyline workflow come from
            Assay metadata instead of from the file.
        3) Merge parse records and database state to create records suitable
            for final execution of the import.
        4) Cache resolved data to Redis.
        5) Send client notifications as status updates.

        :returns: a dict containing the summary data stored in Redis for this import
        """
        logger.info("Resolving identifiers against EDD and reference databases")
        uuid = self.load.request
        try:
            matched_assays = self._verify_line_or_assay_names()
            self._verify_measurement_types(type_resolver)
            self._verify_units()
            reporting.raise_errors(uuid)

            # Determine any additional data not present that must be entered by the user
            if matched_assays:
                # Detect preexisting assay time metadata, if present
                self._assay_pk_to_time = self._verify_assay_times()
            elif not self.parsed.any_time:
                # file didn't contain time, and matched study Lines. No supported workflow for
                # entering required time data
                reporting.raise_errors(uuid, exceptions.TimeUnresolvableError())

            # save the resolved import in Redis for later execution (raises EDDImportError)
            context = self._save_resolved_records(matched_assays)
            warnings = reporting.warning_count(uuid)
            errors = reporting.error_count(uuid)
            if warnings == 0 and errors == 0:
                # only ready when no warnings or errors
                self.load.transition(LoadRequest.Status.READY)
            else:
                self.load.transition(LoadRequest.Status.RESOLVED)
            logger.info(
                f"Done resolving import {self.load.request}. Status is {self.load.status}"
            )
        except Exception as e:
            self.load.transition(LoadRequest.Status.FAILED)
            raise e

        return context

    def _verify_assay_times(self) -> typing.Dict[int, typing.List[float]]:
        """
        Validates that assay time metadata is consistent.

        Checks existing Assays identified in the import file for time metadata,
        and verifies that they all either have time metadata, or that none do.
        Also compares the presence / absence of assay times in the file to
        assay time metadata in the study. Only one or the other should be
        present for this protocol. Logs an error if time is inconsistently
        specified or overspecified.

        :return: a dict that maps assay pk => time if assay times were consistently found,
            None if they were consistently *not* found
        """
        logger.info("Verifying assay times")
        assay_pks = list(self._loa_name_to_pk.values())
        assay_time_mtype = self._assay_time_metatype
        expect_assay_times = not self.parsed.any_time

        consistent_time_condition = Q(metadata__has_key=str(assay_time_mtype.pk))
        if not expect_assay_times:
            consistent_time_condition = ~consistent_time_condition

        # build batches of assay PK's
        # to avoid performance problems with large boolean conditions
        batch_size = getattr(settings, "EDD_IMPORT_BULK_PK_LOOKUP_BATCH", 100)
        assay_pk_batches = [
            assay_pks[i : i + batch_size] for i in range(0, len(assay_pks), batch_size)
        ]

        # query in batches for the number of assays consistent with the file in terms of having
        # time metadata (or not)
        assay_times: typing.Dict[int, typing.List[float]] = {}
        first_inconsistent_batch = None
        for batch_index, batch in enumerate(assay_pk_batches):
            consistent_time_qs = models.Assay.objects.filter(
                consistent_time_condition, pk__in=batch
            )

            if consistent_time_qs.count() == len(batch):
                if expect_assay_times:
                    # convert scalar assay time metadata to a vector to match
                    # MeasurementValue.x for the import
                    for assay in consistent_time_qs:
                        assay_times[assay.pk] = [assay.metadata_get(assay_time_mtype)]
            else:
                first_inconsistent_batch = batch_index
                break

        # if any inconsistency was found, re-query for all inconsistencies, and build a helpful
        # error message
        if first_inconsistent_batch is not None:
            self._add_inconsistent_assay_times_error(
                assay_pk_batches,
                consistent_time_condition,
                expect_assay_times,
                first_inconsistent_batch,
            )
            return None

        if expect_assay_times:
            logger.info("Assays are consistent in having time metadata.")
            return assay_times
        else:
            logger.info("Assays are consistent in NOT having time metadata.")
            return None

    def _add_inconsistent_assay_times_error(
        self,
        assay_pk_batches,
        consistent_time_condition,
        expect_assay_times,
        first_inconsistent_batch,
    ):
        # Builds a user-readable error message
        # regarding assay time inconsistencies found between the file and the study.
        # since at least one inconsistency was already found
        # re-query to find all the inconsistencies,
        # then include results in a helpful error message
        self._assay_time_error = True
        inconsistent_names = []
        for batch in assay_pk_batches[first_inconsistent_batch:]:
            inconsistent_qs = (
                models.Assay.objects.filter(pk__in=batch)
                .exclude(consistent_time_condition)
                .values_list("name", flat=True)
            )
            inconsistent_names.extend(inconsistent_qs)

        # save, but defer raising assay time errors,
        # since in this case we still want to cache the resolved import first
        if len(self.parsed.line_or_assay_names) == len(inconsistent_names):
            # provide a more generic error if no assay times were found.
            # depending on use case, user may have not even intended to get here.
            if expect_assay_times:
                error = exceptions.TimeNotProvidedError()
            else:
                error = exceptions.OverdeterminedTimeError()
        else:
            # if only a subset of assays were missing time,
            # so provide a more specific msg on just the omitted ones
            if expect_assay_times:
                error = exceptions.MissingAssayTimeError(details=inconsistent_names)
            else:
                error = exceptions.OverdeterminedTimeError(details=inconsistent_names)
        reporting.add_errors(self.load.request, error)

    def _verify_line_or_assay_names(self) -> bool:
        # Compares identifiers from the file
        # to Lines and / or Assay names
        # and tracks errors
        line_or_assay_names = self.parsed.line_or_assay_names
        logger.info(f"Searching for {len(line_or_assay_names)} study internals")

        # first try assay names, since this is required to make re-upload work.
        # It's also required for the Skyline workflow,
        # where assay metadata is the source of time rather than the file.
        if self._verify_assay_match(line_or_assay_names):
            return True
        elif not self._verify_line_match(line_or_assay_names):
            reporting.add_errors(
                self.load.request,
                exceptions.UnmatchedStudyInternalsError(details=line_or_assay_names),
            )
        return False

    def _verify_assay_match(self, names):
        qs = models.Assay.objects.filter(
            active=True,
            name__in=names,
            protocol_id=self.load.protocol.pk,
            study_id=self.load.study.pk,
        )
        count = qs.count()
        self._loa_name_to_pk = dict(qs.values_list("name", "pk"))
        self._assay_name_to_line_pk = dict(qs.values_list("name", "line_id"))
        if count == 0:
            return False
        elif count < len(names):
            unmatched = names - self._loa_name_to_pk.keys()
            reporting.add_errors(
                self.load.request,
                exceptions.UnmatchedAssayError(
                    details=unmatched,
                    resolution=_(
                        "Check for: A) identifiers in the file that don't match "
                        "assays in the study, or B) missing assays in the study "
                        "due to omitted time in the experiment definition"
                    ),
                ),
            )
        elif count > len(names):
            duplicates = (
                qs.values("name")
                # group by name and find those with duplicates
                .annotate(count=Count("name"))
                .filter(count__gt=1)
                # re-order by name and remove count annotation
                .order_by("name")
                .values_list("name", flat=True)
            )
            reporting.add_errors(
                self.load.request, exceptions.DuplicateAssayError(details=duplicates),
            )
        return True

    def _verify_line_match(self, names):
        qs = models.Line.objects.filter(
            active=True, name__in=names, study_id=self.load.study.pk,
        )
        count = qs.count()
        self._loa_name_to_pk = dict(qs.values_list("name", "pk"))
        if count == 0:
            return False
        elif count < len(names):
            unmatched = names - self._loa_name_to_pk.keys()
            reporting.add_errors(
                self.load.request, exceptions.UnmatchedLineError(details=unmatched),
            )
        elif count > len(names):
            duplicates = (
                qs.values("name")
                # group by name and find those with duplicates
                .annotate(count=Count("name"))
                .filter(count__gt=1)
                # re-order by name and remove count annotation
                .order_by("name")
                .values_list("name", flat=True)
            )
            reporting.add_errors(
                self.load.request, exceptions.DuplicateLineError(details=duplicates),
            )
        return True

    def _verify_measurement_types(self, type_resolver):
        # Verifies MeasurementType identifiers found in the import
        # against EDD and external databases.
        # If errors occur, lookups are aborted
        # after EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT failed lookups are performed.

        # extract some data for use during lookups
        parsed = self.parsed

        error_limit = getattr(settings, "EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT", 0)
        error_count = 0

        # loop over measurement type names, looking them up in the appropriate place
        for mtype_id in parsed.mtypes:
            try:
                found = type_resolver.lookup_type(mtype_id)
                self._mtype_name_to_type[mtype_id] = found
            except ValidationError:
                logger.exception(f"Exception verifying MeasurementType id {mtype_id}")
                # track errors and progress
                error_count += 1
                reporting.add_errors(
                    self.load.request, exceptions.UnmatchedMtypeError(details=mtype_id),
                )
                # to stay responsive, stop lookups after a threshold is reached
                if error_count == error_limit:
                    message = _("Aborted after {count} failed lookups.")
                    reporting.raise_errors(
                        self.load.request,
                        exceptions.UnmatchedMtypeError(
                            details=message.format(count=error_count)
                        ),
                    )

    def _verify_units(self):
        # Verifies unit names found in the import against units in the EDD database.
        units = models.MeasurementUnit.objects.filter(unit_name__in=self.parsed.units)
        self._unit_name_to_unit = dict(units.values_list("unit_name", "pk"))
        missing_units = self.parsed.units - self._unit_name_to_unit.keys()

        logger.info(
            f"Found {len(self._unit_name_to_unit)} of {len(self.parsed.units)} units: "
            f"{self._unit_name_to_unit}"
        )

        if missing_units:
            reporting.add_errors(
                self.load.request,
                exceptions.UnsupportedUnitsError(details=missing_units),
            )

    def _save_resolved_records(
        self, matched_assays: bool
    ) -> typing.Dict[str, typing.Any]:
        # Does some final error checking,
        # then resolves parse results into records
        # that can be easily inserted into the database in a follow-on task
        cacher = ImportCacheCreator(load=self.load)

        # provide a bunch of other data needed for cache creation
        cacher.assay_time_err = self._assay_time_error
        cacher.matched_assays = matched_assays
        cacher.parsed = self.parsed
        cacher.loa_name_to_pk = self._loa_name_to_pk
        cacher.assay_pk_to_time = self._assay_pk_to_time
        cacher.mtype_name_to_type = self._mtype_name_to_type
        cacher.unit_name_to_unit = self._unit_name_to_unit
        cacher.assay_name_to_line_pk = self._assay_name_to_line_pk

        # create the cache entries and compute any remaining required inputs, assuming no
        # collisions are detected
        return cacher.save_resolved_import_records()


class ImportCacheCreator:
    """
    Collection of mappings of input values to database primary keys.

    Takes a ParseResult and resolved database state and generates + saves
    import records more conducive to final processing by
    complete_import_task(). Also performs some final error checking that isn't
    possible until this point in the process -- verifies that no colliding
    records are being added.
    """

    def __init__(self, load: LoadRequest):
        self.load = load
        self.parsed: ParseResult = None
        self.assay_time_err: bool = False
        self.loa_name_to_pk: typing.Dict[str, int] = None
        self.matched_assays: bool = None
        # self.matched_assays: bool = None
        # self.loa_name_to_pk: typing.Dict[str, int] = None
        self.assay_pk_to_time: typing.Dict[int, typing.List[float]] = None
        self.mtype_name_to_type: typing.Dict[str, models.MeasurementType] = None
        self.unit_name_to_unit: typing.Dict[str, int] = None
        self.assay_name_to_line_pk = None

    def save_resolved_import_records(self):
        """
        Converts MeasurementParseRecord objects created during the parsing step into JSON to
        send to the final Celery task, merging together parse records that will be stored under
        the same Measurement.

        See also ImportExecutor._load_or_create_measurement()
        """

        # use in-memory parse results to build a set of JSON records for final import execution
        import_records_list = self._build_import_records()

        # raise any errors detected during the record build
        # e.g. duplicate entries detected in the request,
        # but defer raising only errors that refer to missing assay time metadata.
        # such imports are fine as-is and should be set to Resolved
        # before the error messages get sent
        # re: additional required information before they can be completed
        if (reporting.error_count(self.load.request)) > 1 or not self.assay_time_err:
            reporting.raise_errors(self.load.request)

        # break import records into pages that conform to the cache page limit settings...we'll
        # respect the settings while they exist, since they have performance impact on final
        # execution, though they'll be used differently after transition to the new import and
        # maybe removed later
        self.paged_series = self._paginate_cache(import_records_list)

        cache_page_size = settings.EDD_IMPORT_PAGE_SIZE
        page_count = math.ceil(len(import_records_list) / cache_page_size)

        # clear all data from any previous files uploaded for this import
        redis = ImportBroker()
        redis.clear_context(self.load.request)
        redis.clear_pages(self.load.request)

        # cache the new data
        for page in self.paged_series:
            redis.add_page(self.load.request, json.dumps(page, cls=JSONEncoder))

        conflicts = self._compute_required_inputs(import_records_list)

        context = {
            "conflicted_from_study": conflicts.from_study,
            "conflicted_from_import": conflicts.from_import,
            "file_has_times": self.parsed.has_all_times,
            "file_has_units": self.parsed.has_all_units,
            "importId": self.load.request,
            "loa_pks": {pk for pk in self.loa_name_to_pk.values()},
            "matched_assays": self.matched_assays,
            "total_vals": len(self.parsed.series_data),
            "totalPages": page_count,
            "use_assay_times": self.matched_assays and bool(self.assay_pk_to_time),
        }
        redis.set_context(self.load.request, json.dumps(context, cls=JSONEncoder))
        return context

    def _compute_required_inputs(self, import_records_list) -> ConflictSummary:
        if not (self.assay_pk_to_time or self.parsed.has_all_times):
            reporting.add_errors(self.load.request, exceptions.TimeUnresolvableError())
            conflicts = ConflictSummary(from_import=0, from_study=0)
        else:
            conflicts = self._detect_conflicts(import_records_list)
            if conflicts.from_import:
                total = len(self.parsed.series_data)
                if total == conflicts.from_import:
                    reporting.warnings(
                        self.load.request,
                        exceptions.OverwriteWarning(total, conflicts),
                    )
                else:
                    reporting.warnings(
                        self.load.request, exceptions.MergeWarning(total, conflicts),
                    )
        return conflicts

    def _detect_conflicts(self, import_records_list) -> ConflictSummary:
        # Inspects all the records for this import
        # and queries the database to detect any existing MeasurementValues
        # that will be duplicated or overwritten by importing this data.
        # This is important to give the user up-front feedback on the import,
        # or the user can also choose to skip this check
        # if an overwrite/duplication is planned.

        # if user has chosen to ignore potential overwrites / duplicates, don't check for them
        assay_overwrite = self.matched_assays and self.load.allow_overwrite
        assay_duplication = self.load.allow_duplication and not self.matched_assays
        if assay_overwrite or assay_duplication:
            return ConflictSummary(from_import=0, from_study=0)

        check = "overwrites" if self.matched_assays else "duplication"
        logger.info(f"Checking for {check}...")

        conflicted_from_study = 0
        conflicted_from_import = 0
        # query these once outside the loop
        study = self.load.study
        protocol = self.load.protocol
        for item in import_records_list:
            # use the same Measurement lookup fields that the final import code does
            measurement_filter = {
                "measurement__active": True,
                "measurement__compartment": item.get(
                    "compartment", self.load.compartment
                ),
                "measurement__measurement_type_id": item.get("measurement_id"),
                "measurement__measurement_format": item.get("format"),
                "measurement__x_units_id": item.get("x_unit_id"),
                "measurement__y_units_id": item.get("y_unit_id"),
            }

            # build up a list of unique x-values (each of which may be an array)
            x: typing.List[float]
            y: typing.List[float]
            for x, _y in item["data"]:
                # never runs for line name input
                # since it won't get this far
                # if a line name-based file doesn't contain times
                if not self.parsed.has_all_times:
                    assay_pk = item["assay_id"]
                    x = self.assay_pk_to_time[assay_pk]

                # Note: x__in doesn't work as of Django 2.0.9...
                # even explicitly casting each element of x to Decimal
                # before filtering for x__in caused a Postgres type error.
                # So unfortunately we have to do this query inside the loop
                qs = models.MeasurementValue.objects.filter(
                    study_id=study.pk, x=x, measurement__assay__protocol_id=protocol.pk,
                )
                if self.matched_assays:
                    assay_pk = item["assay_id"]
                    qs = qs.filter(measurement__assay_id=assay_pk)
                else:
                    line_pk = item["line_id"]
                    qs = qs.filter(measurement__assay__line_id=line_pk)

                qs = qs.filter(**measurement_filter)
                count = qs.count()
                conflicted_from_study += count
                if count:
                    conflicted_from_import += 1
                logger.debug(
                    f"Found {count} existing values at time {x}, "
                    f"for {measurement_filter}"
                )

        return ConflictSummary(
            from_study=conflicted_from_study, from_import=conflicted_from_import
        )

    def _build_import_records(self) -> typing.List[typing.Dict]:
        # Builds records for the final import
        # from MeasurementParseRecords read by the parser.
        # Merges import parse records,
        # which often result from separate lines of a file,
        # to store values for the same Measurement combination
        # (assay/line + measurement type + units)
        # in a single record for final import.
        # Merging avoids bloat in the JSON
        # and also reduces repetitive Measurement lookups in downstream processing.

        # This merge should always be O(n),
        # and in the best case (e.g. OD measurements over time on a single line/assay),
        # would eliminate n-1 downstream Measurement queries.

        # TODO: add a setting to limit the number of records that can be merged together.
        #  This will limit the size of individual pages in Redis.
        #  Behavior with existing small datasets should be similar to the legacy import.
        import_records = {}

        # maps ident -> dict().
        # inner dict maps unique time => list of MeasurementParseRecords.
        # None is a valid time for Proteomics time,
        # which will later be copied from assay metadata
        import_times = collections.defaultdict(lambda: collections.defaultdict(list))
        parse_record: MeasurementParseRecord
        for parse_record in self.parsed.series_data:
            if getattr(parse_record, "data", None) is None:
                continue
            # extract info from the parse record and build a unique ID for the Measurement to be
            # created.
            loa_pk = self.loa_name_to_pk.get(parse_record.loa_name)
            mtype = (
                self.mtype_name_to_type[parse_record.mtype_name]
                if parse_record.mtype_name
                else None
            )
            unit = self.unit_name_to_unit.get(parse_record.y_unit_name, None)
            ident = (loa_pk, mtype.pk, unit)

            # merge parse records that match the same ID (but should have different times)
            import_record = import_records.get(ident, None)
            if not import_record:
                import_record: typing.Dict = self._build_import_record(parse_record)
                import_records[ident] = import_record
            else:
                # merge data in this parse record with others for the same loa/mtype/unit
                import_record["data"].append(parse_record.data)
                import_record["src_ids"].extend(parse_record.src_ids)

            # track the original sources from the parse step for all data that may clash
            # (note None is a valid time, e.g. for formats with no time, where "ident" will
            # uniquely determine time found in assay metadata)
            time = parse_record.data[0][0]
            import_times[ident][time].append(parse_record)

        # now that final src_ids content is known from all import records, build a human-readable
        # string from the list of items (e.g. file rows)
        for import_record in import_records.values():
            src_ranges_list = build_src_summary(
                import_record["src_ids"], convert_ints=True
            )
            ranges_str = ", ".join(src_ranges_list)
            import_record["src_ids"] = f"{self.parsed.record_src} {ranges_str}"

        # after reviewing all the data, build a single error message for each set of
        # (loa_name + time + measurement type) clashes
        for time_dict in import_times.values():
            for time, parse_records in time_dict.items():
                if len(parse_records) > 1:
                    self._record_record_clash(time, parse_records)

        return [*import_records.values()]

    def _build_import_record(self, parse_record) -> typing.Dict:
        # Builds a record to be used in the final import...
        # essentially a variant of the parse record
        # with string identifiers (e.g. for MeasurementTypes, Units, etc)
        # replaced with primary keys or enum values.

        assay_or_line_pk = self.loa_name_to_pk.get(parse_record.loa_name)
        mtype = (
            self.mtype_name_to_type[parse_record.mtype_name]
            if parse_record.mtype_name
            else None
        )
        x_unit = self.unit_name_to_unit.get(parse_record.x_unit_name, None)
        y_unit = self.unit_name_to_unit.get(parse_record.y_unit_name, None)

        # build up a list of src_ids for this import record,
        # being tolerant of different src_id storage formats in parser implementations...
        # e.g. many tabular formats will have a 1-1 correspondence
        # between rows in the file
        # and resulting MeasurementParseRecords,
        # and a single row number tracing its origin.
        if isinstance(parse_record.src_ids, (tuple, list)):
            src_ids = list(parse_record.src_ids)
        else:
            src_ids = [parse_record.src_ids]
        import_record = {
            "measurement_id": mtype.pk,
            "compartment": self.load.compartment,
            "x_unit_id": x_unit if x_unit else None,
            "y_unit_id": y_unit if y_unit else None,
            "data": [parse_record.data],
            "format": parse_record.value_format,
            "src_ids": src_ids,
        }

        if self.matched_assays:
            import_record["assay_id"] = assay_or_line_pk
            import_record["assay_name"] = parse_record.loa_name
            import_record["line_id"] = self.assay_name_to_line_pk.get(
                parse_record.loa_name, None
            )
        else:
            line_pk = assay_or_line_pk
            import_record["line_id"] = line_pk
            import_record["line_name"] = parse_record.loa_name

        return import_record

    def _paginate_cache(self, import_records):
        cache_page_size = settings.EDD_IMPORT_PAGE_SIZE
        max_cache_pages = settings.EDD_IMPORT_PAGE_LIMIT

        page_count = math.ceil(len(import_records) / cache_page_size)
        if page_count > max_cache_pages:
            msg = _("Total number of pages is exceeds maximum of {max} records").format(
                max=settings.EDD_IMPORT_PAGE_LIMIT
            )
            raise exceptions.ImportTooLargeError(details=msg)

        for i in range(0, len(import_records), cache_page_size):
            yield import_records[i : i + cache_page_size]

    def _record_record_clash(self, import_time, parse_records):
        # Logs an error re: MeasurementParseRecords
        # that resolve to the same (time + line/assay + MeasurementType) combination.

        # Merge information about the records' sources in the file
        # to produce a summary of where the problem originated
        # e.g., a list of ranges of file rows where the clashing data came from
        colliding_ranges = []
        for record in parse_records:
            colliding_ranges.extend(record.src_ids)
        colliding_ranges = build_src_summary(colliding_ranges, convert_ints=True)
        ranges_str = ", ".join(colliding_ranges)
        details = f"{self.parsed.record_src} {ranges_str}"

        loa_name = parse_records[0].loa_name
        mtype_name = parse_records[0].mtype_name
        reporting.add_errors(
            self.load.request,
            exceptions.MeasurementCollisionError(
                subcategory=f"({loa_name}, {mtype_name} @ {import_time}h)",
                details=details,
            ),
        )
