import collections
import copy
import importlib
import json
import logging
import math
from collections import namedtuple
from typing import Any, Dict, List, Set, Tuple
from uuid import UUID

import arrow
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import (
    MultipleObjectsReturned,
    ObjectDoesNotExist,
    PermissionDenied,
    ValidationError,
)
from django.db import transaction
from django.db.models import Count, Q
from django.utils.translation import ugettext_lazy as _

from edd.load.broker import ImportBroker
from edd.utilities import JSONEncoder
from main.models import (
    SYSTEM_META_TYPES,
    Assay,
    Line,
    Measurement,
    MeasurementType,
    MeasurementUnit,
    MeasurementValue,
    Metabolite,
    MetadataType,
    Update,
)

from ..exceptions import (
    BadParserError,
    DuplicateAssayError,
    DuplicateLineError,
    GeneNotFoundError,
    IllegalTransitionError,
    ImportConflictWarning,
    ImportTooLargeError,
    MeasurementCollisionError,
    MetaboliteNotFoundError,
    MissingAssayTimeError,
    OverdeterminedTimeError,
    PhosphorNotFoundError,
    ProteinNotFoundError,
    TimeNotProvidedError,
    TimeUnresolvableError,
    UnmatchedAssayError,
    UnmatchedLineError,
    UnmatchedMtypeError,
    UnmatchedStudyInternalsError,
    UnplannedOverwriteError,
    UnsupportedMimeTypeError,
    UnsupportedUnitsError,
    add_errors,
    raise_errors,
)
from ..exceptions.core import err_type_count
from ..models import Import, ImportParser
from ..notify.backend import ImportWsBroker
from ..parsers import FileParseResult, MeasurementParseRecord, build_src_summary
from ..utilities import MTYPE_GROUP_TO_CLASS

logger = logging.getLogger(__name__)

User = get_user_model()

_ConflictSummary = ImportConflictWarning.ConflictSummary

# maps mtype group to error identifiers for failed lookup
MTYPE_GROUP_TO_ERR_CLASS = {
    MeasurementType.Group.GENERIC: UnmatchedMtypeError,
    MeasurementType.Group.METABOLITE: MetaboliteNotFoundError,
    MeasurementType.Group.GENEID: GeneNotFoundError,
    MeasurementType.Group.PROTEINID: ProteinNotFoundError,
    MeasurementType.Group.PHOSPHOR: PhosphorNotFoundError,
}


def _measurement_search_fields(
    import_record, master_compartment, master_y_units_pk, via=()
):
    return {
        "__".join([*via, "active"]): True,
        "__".join([*via, "compartment"]): import_record.get(
            "compartment", master_compartment
        ),
        "__".join([*via, "measurement_type_id"]): import_record["measurement_id"],
        "__".join([*via, "measurement_format"]): import_record["format"],
        "__".join([*via, "x_units_id"]): import_record["x_unit_id"],
        "__".join([*via, "y_units_id"]): import_record.get(
            "y_unit_id", master_y_units_pk
        ),
    }


def _build_duration(start, end):
    # TODO: restore granularity="second" once the humanize bug is fixed
    # https://github.com/crsmithdev/arrow/issues/727#issuecomment-562750599
    return end.humanize(start, only_distance=True)


class ProgressReporter:
    """
    A skeleton implementation to do some limited progress reporting, to eventually extend to
    provide more granular user feedback via intermediate progress updates
    """

    def __init__(
        self, import_: Import, max_progress: int, lookup: str, rpt_inc_percent: float
    ):
        self.import_: Import = import_
        self._lookup_count: int = max_progress
        self._lookup: str = lookup
        self._rpt_incr_percent: float = rpt_inc_percent

        self._total_count: int = 0  # total mtypes looked up so far (pass or fail)
        # counter to track when to next report status. avoid repeated divisions for more precise
        # percent-based reporting increments.  this is just for humans to read, most likely in a
        # progressbar
        self._reporting_ct: float = 0
        self._rpt_incr: int = 0  # lookup increment @ which to report status
        self._start = None  # start time of the lookups

    def start(self):
        self._total_count = 0
        self._reporting_ct = 0
        self._rpt_incr = 0

        self._rpt_incr = math.ceil(self._lookup_count * self._rpt_incr_percent * 0.01)
        self._start = arrow.utcnow()

    def end(self):
        end = arrow.utcnow()
        duration = _build_duration(self._start, end)
        logger.info(
            f"Done looking up {self._lookup_count} {self._lookup} in {duration}"
        )

    def progress(self, count: int = 1):
        self._reporting_ct += count
        self._total_count += count

        # log a helpful message each ~5% so we can actively track how far we've gone
        if self._reporting_ct == self._rpt_incr:
            self._reporting_ct = 0
            self._report_progress()

    def _report_progress(self):
        percent = round((self._total_count * 100) / self._lookup_count)
        category = self.import_.category
        duration = _build_duration(self._start, arrow.utcnow())
        logger.info(
            f"{category.name} {self._lookup} lookup: {percent}% complete in"
            f" {duration}"
        )
        # TODO: add a WS progress notification for more granular UI feedback

    def abort(self):
        end = arrow.utcnow()
        duration = _build_duration(self._start, end)
        lookup_count = self._lookup_count
        logger.info(
            f"Aborted after looking up {self._total_count} / {lookup_count} "
            f"{self._lookup} in"
            f" {duration}"
        )


class ImportParseExecutor:
    """
    Looks up the configured file parser for this import and uses it to parse the file content,
    verifying that the content adheres to the file format (though it's validity will be
    determined later)
    """

    def __init__(self, import_: Import, user, ws: ImportWsBroker):
        super().__init__()
        self._import: Import = import_
        self._user = user
        self._ws: ImportWsBroker = ws

    def parse(self):
        """
        Parse the file, raising an Exception if any parse / initial verification errors occur.

        :returns: an edd_file_importer.parsers.FileParseResult if the file was
            successfully parsed
        :raises ParseException, OSException if the file couldn't be parsed, or opened,
            respectively
        """
        try:
            if self._import.file_format:
                self._get_parser_instance()
                return self._parse_file()

            # if file format is unknown and parsing so far has only returned row/column data to the
            # UI for display, then just save the inputs and return
            if not self._import.file_format:
                # TODO: integrate parser to get a block of tabular file content as JSON for display
                #  in the UI
                # parsed = None
                # self._notify_format_required(parsed)
                raise NotImplementedError("Not yet implemented")
        except Exception as e:
            # for consistency, update the import to failed in case ParseExecutor is used outside
            # the context of the normal EDD import pipeline
            self._import.status = Import.Status.FAILED
            self._import.save()
            raise e

    def _get_parser_instance(self):
        """
        Look up the file parser class based on user input and database configuration
        """
        parser = None
        mime_type = self._import.file.mime_type
        uuid: UUID = self._import.uuid
        try:
            parser: ImportParser = ImportParser.objects.get(
                format=self._import.file_format, mime_type=mime_type
            )
        except ObjectDoesNotExist:
            raise_errors(uuid, UnsupportedMimeTypeError(details=mime_type))
        logger.info(
            f'Looking up parser class for file format "{self._import.file_format}": '
            f'"{parser.parser_class}" ...'
        )

        # split fully-qualified class name into module and class names
        try:
            module_name, class_name = parser.parser_class.rsplit(sep=".", maxsplit=1)
        except ValueError:
            raise_errors(
                uuid,
                BadParserError(
                    details=_("Malformed parser class {parser_class}").format(
                        parser_class=parser.parser_class
                    )
                ),
            )
        try:
            # instantiate the parser.
            module = importlib.import_module(module_name)
            parser_class = getattr(module, class_name)
            return parser_class(uuid)
        except Exception as e:
            raise_errors(
                uuid,
                BadParserError(
                    details=_(
                        "Unable to instantiate parser class {parser_class}.  The problem "
                        "was {problem}"
                    ).format(parser_class=parser.parser_class, problem=str(e))
                ),
            )

    def _parse_file(self):
        file = self._import.file.file
        file_name = self._import.file.filename
        study = self._import.study

        parser = self._get_parser_instance()

        logger.info(
            f"Parsing import file {file_name} for study {study.pk} ({study.slug}), "
            f"user {self._user.username}"
        )

        # work around nonstandard interface for Django's FieldFile that causes CSV parsing to fail
        # for files stored as Django model objects.  Note that consistently calling .open() on
        # XLS files causes parsing to fail.
        if self._import.file.mime_type == "text/csv":
            with file.open("rt") as fh:
                # raises ParseException, OSException
                return parser.parse(fh)
        else:
            # raises ParseException, OSException
            return parser.parse(file)

    def _notify_format_required(self, parsed):
        import_ = self._import
        payload = {
            "uuid": import_.uuid,
            "status": import_.status,
            "raw_data": parsed.raw_data,  # TODO: implement
        }
        message = _(
            'Your import file, "{file_name}" has been saved, but file format input '
            "is needed to process it"
        ).format(file_name=import_.file.filename)
        self._ws.notify(message, tags=("import-status-update",), payload=payload)


class ImportResolver:
    """
    Resolves parsed file content against EDD and other reference databases.

    This includes matching line/assay names from the file against the EDD study, matching
    MeasurementType and unit identifiers against EDD and/or external references, and testing
    that any inputs required to complete the import are either provided in the file, via direct
    input during the import (where supported) or found in the study (e.g. assay time metadata
    for Skyline).
    """

    def __init__(self, import_: Import, parsed: FileParseResult, user):
        super().__init__()
        self._import: Import = import_
        self._user = user
        self._parsed: FileParseResult = parsed
        self._assay_time_err: bool = False

        self._assay_time_metatype: MetadataType = MetadataType.objects.get(
            uuid=SYSTEM_META_TYPES["Time"]
        )

        ###########################################################################################
        # EDD DB content cached while resolving parsed file content
        ###########################################################################################

        # maps external identifiers from the import file, e.g. Uniprot accession ID, to the
        # EDD model object
        self._mtype_name_to_type: Dict[str, MeasurementType] = {}

        # maps line or assay name from the file to the model object pk
        self._loa_name_to_pk: Dict[str, int] = {}

        # maps assay name from file to existing line pk, only if file contained assay names
        self._assay_name_to_line_pk: Dict[str, int] = {}

        # maps assay pk -> time read from assay metadata (Skyline workflow). Only used when
        # matched_assays is True.  Using vector time to match MeasurementValue.x.
        self._assay_pk_to_time: Dict[int, List[float]] = {}

        self._unit_name_to_unit: Dict[str, MeasurementUnit] = {}

    def resolve(
        self, initial_upload: bool, requested_status: str
    ) -> Tuple[Import, Dict[str, Any]]:
        """
        Resolves successfully parsed file content against EDD and external databases (e.g. PubChem)
        to determine if the import can be completed.  If this method returns without raising an
        exception, the import has either been marked RESOLVED or READY.

        Basic steps are:

        1) Resolve Line/Assay/MeasurementType/MeasurementUnit identifiers from the file to known
            references
        2) Test whether sufficient inputs are provided to complete the import.  For example,
            measurement times in the Skyline workflow come from Assay metadata instead of from the
            file.
        3) Merge parse records and database state to create records suitable for final execution
            of the import
        4) Cache resolved data to Redis
        3) Send client notifications as status updates

        :param initial_upload: True if this is the initial file upload for this Import,
            False otherwise
        :param requested_status: requested status for the import, if any.  If requested status is
            Import.Status.SUBMITTED, an attempt will be made to submit the import
        :return a dict containing the summary data stored in Redis for this import
        """
        # TODO: as an enhancement, compute & use file hashes to prevent re-upload
        logger.info("Resolving identifiers against EDD and reference databases")
        uuid = self._import.uuid

        try:
            #######################################################################################
            # Resolve all string identifiers from the file against EDD's database and / or remote
            # sources, deferring Exceptions until all (likely user-generated) problems are detected
            # For problematic files, that should give users very good feedback about what needs to
            # be fixed
            #######################################################################################
            matched_assays: bool = self._verify_line_or_assay_names()
            self._verify_measurement_types()
            self._verify_units()
            raise_errors(uuid)

            # Determine any additional data not present in the file that must be entered by the
            # user
            if matched_assays:
                # Detect preexisting assay time metadata, if present. E.g. in the Skyline workflow
                self._assay_pk_to_time = self._verify_assay_times()
            elif not self._parsed.any_time:
                # file didn't contain time, and matched study Lines. No supported workflow for
                # entering required time data
                raise_errors(uuid, TimeUnresolvableError())

            # save the resolved import in Redis for later execution (raises EDDImportError)
            context: Dict[str, Any] = self._save_resolved_records(
                initial_upload, matched_assays
            )
            required_inputs = context["required_post_resolve"]

            # Update the import DB model
            import_: Import = self._import
            import_.status = (
                Import.Status.READY if not required_inputs else Import.Status.RESOLVED
            )
            import_.save()
            logger.info(
                f"Done resolving import {import_.pk}.  Status is {import_.status}"
            )

            if requested_status == Import.Status.SUBMITTED:
                # if client submitted the import, raise any deferred assay time errors (skyline
                # only), which were deferred since it was still valid to cache the import since
                # otherwise resolved successfully. Additionally, if client didn't request to
                # submit, then assay time errors should be deferred indefinitely rather than
                # failing the import
                raise_errors(uuid)

        except Exception as e:
            # make certain the import gets updated to FAILED, even if used outside the context of
            # EDD's import pipeline
            self._import.status = Import.Status.FAILED
            self._import.save()
            raise e

        return import_, context

    def _verify_assay_times(self) -> Dict[int, List[float]]:
        """
        Checks existing Assays identified in the import file for time metadata, and verifies that
        they all either have time metadata, or that none do. Also compares the presence /
        absence of assay times in the file to assay time metadata in the study.  Only one or the
        other should be present for this protocol. Logs an error if time is inconsistently
        specified or overspecified.

        :return: a dict that maps assay pk => time if assay times were consistently found,
            None if they were consistently *not* found
        """
        logger.info("Verifying assay times")
        assay_pks = list(self._loa_name_to_pk.values())
        assay_time_mtype = self._assay_time_metatype
        expect_assay_times = not self._parsed.any_time

        consistent_time_condition = Q(metadata__has_key=str(assay_time_mtype.pk))
        if not expect_assay_times:
            consistent_time_condition = ~consistent_time_condition

        # build batches of assay PK's to avoid performance problems with large boolean conditions
        # in the DB query
        batch_size = getattr(settings, "EDD_IMPORT_BULK_PK_LOOKUP_BATCH", 100)
        assay_pk_batches = [
            assay_pks[i : i + batch_size] for i in range(0, len(assay_pks), batch_size)
        ]

        # query in batches for the number of assays consistent with the file in terms of having
        # time metadata (or not)
        assay_times: Dict[int, List[float]] = {}
        first_inconsistent_batch = None
        for batch_index, batch in enumerate(assay_pk_batches):
            consistent_time_qs = Assay.objects.filter(
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
            self._add_inconsistent_assay_times_err(
                assay_pk_batches,
                consistent_time_condition,
                expect_assay_times,
                first_inconsistent_batch,
            )
            return None

        modifier = " NOT" if not expect_assay_times else ""
        logger.info(f"Assays are consistent in{modifier} having time metadata")

        if expect_assay_times:
            return assay_times
        return None

    def _add_inconsistent_assay_times_err(
        self,
        assay_pk_batches,
        consistent_time_condition,
        expect_assay_times,
        first_inconsistent_batch,
    ):
        """
        Builds a user-readable error message regarding assay time inconsistencies found between
        the file and the study.
        """
        # since at least one inconsistency was already found re-query to find all the
        # inconsistencies, then include results in a helpful error message
        self._assay_time_err = True
        inconsistent_names = []
        for batch in assay_pk_batches[first_inconsistent_batch:]:
            inconsistent_qs = Assay.objects.filter(pk__in=batch)
            inconsistent_qs = inconsistent_qs.exclude(consistent_time_condition)
            inconsistent_qs = inconsistent_qs.values("name", "pk")
            inconsistent_names.extend(list(val["name"] for val in inconsistent_qs))

        # save, but defer raising assay time errors, since in this case we still want to cache
        # the resolved import first
        if len(self._parsed.line_or_assay_names) == len(inconsistent_names):
            # provide a more generic error if no assay times were found.
            # depending on use case, user may have not even intended to get here.
            err_class = (
                TimeNotProvidedError if expect_assay_times else OverdeterminedTimeError
            )
            add_errors(self._import.uuid, err_class())
        else:
            # if only a subset of assays were missing time, so provide a more specific msg
            # on just the omitted ones
            err_class = (
                MissingAssayTimeError if expect_assay_times else OverdeterminedTimeError
            )
            add_errors(self._import.uuid, err_class(details=inconsistent_names))

    def _verify_line_or_assay_names(self) -> bool:
        """
        Compares identifiers from the file to Lines and / or Assay names in the file and tracks
        errors a problem occurs.

        :return: True if IDs from file matched Assays in the study
        """
        line_or_assay_names = self._parsed.line_or_assay_names
        logger.info(f"Searching for {len(line_or_assay_names)} study internals")

        # first try assay names, since this is required to make re-upload work. It's also
        # required for the Skyline workflow, where assay metadata is the source of time rather
        # than the file.
        matched_assays = self._verify_line_or_assay_match(
            line_or_assay_names, lines=False
        )
        if matched_assays:
            return True

        matched_lines = self._verify_line_or_assay_match(
            line_or_assay_names, lines=True
        )
        if not matched_lines:
            # convert frozenset from parsing into a form that's JSON serializable
            add_errors(
                self._import.uuid,
                UnmatchedStudyInternalsError(details=line_or_assay_names),
            )
        return False

    def _verify_line_or_assay_match(self, line_or_assay_names, lines):
        """
        A helper method that queries the database for lines or assays in the current study that
        match names from the file.

        :param line_or_assay_names: unique names from the file
        :param lines: True to compare names from the file to lines in the study, False to compare
            to assays
        :return True if one or more names from line_or_assay_names matched objects in the study
        """

        # query for the number of matching lines or assays in the study
        import_ = self._import
        study_pk = import_.study_id
        extract_vals = ["name", "pk"]
        if lines:
            qs = Line.objects.filter(
                study_id=study_pk, name__in=line_or_assay_names, active=True
            ).values(*extract_vals)
        else:
            protocol_pk = import_.protocol_id
            extract_vals.append("line_id")
            qs = Assay.objects.filter(
                study_id=study_pk,
                name__in=line_or_assay_names,
                protocol_id=protocol_pk,
                active=True,
            ).values(*extract_vals)

        # if any name was matched do further processing
        found_count = qs.count()
        if found_count:
            model = "line" if lines else "assay"
            input_count = len(line_or_assay_names)
            logger.info(
                f"Matched {found_count} of {input_count} {model} names from the file"
            )

            # store results for future use
            self._loa_name_to_pk = {result["name"]: result["pk"] for result in qs}
            if not lines:
                self._assay_name_to_line_pk = {
                    result["name"]: result["line_id"] for result in qs
                }

            # if some, but not all of the names from file matched the study, requery for detail
            # and store a helpful error message
            if found_count != input_count:
                self._add_partial_name_match_err(
                    line_or_assay_names, lines, found_count
                )

        return bool(found_count)

    def _add_partial_name_match_err(self, line_or_assay_names, lines, found_count):
        """
        After one, but not all line/assay names from the file matched the study, queries the
        database for additional detail and builds/stores a helpful user-facing error message
        """
        study_pk = self._import.study_id
        input_count = len(line_or_assay_names)
        if found_count < input_count:
            names = list(line_or_assay_names - self._loa_name_to_pk.keys())
            err_class = UnmatchedLineError if lines else UnmatchedAssayError
        else:
            # found_count > input_count...find duplicate Line/Assay names in the study
            initial_qs = (
                Line.objects.filter(study_id=study_pk)
                if lines
                else Assay.objects.filter(study_id=study_pk)
            )
            names = (
                initial_qs.values("name")  # group by name
                .annotate(count=Count("name"))
                .filter(count__gt=1)
                .order_by("name")
                .values_list("name", flat=True)  # filter out annotation
            )
            err_class = DuplicateLineError if lines else DuplicateAssayError
        resolution = None
        if err_class == UnmatchedAssayError and not self._parsed.any_time:
            # Build a special-case error message for workflows that depend on assay time metadata,
            # e.g. Skyline. The immediate problem is that identifiers in the file didn't match
            # assays in the study, but the likely cause is that a subset of assay times were
            # omitted from the experiment description, resulting in missing assays.
            resolution = _(
                "Check for: A) identifiers in the file that don't match assays in the "
                "study, or B) missing assays in the study due to omitted time in the "
                "experiment description"
            )
        add_errors(self._import.uuid, err_class(details=names, resolution=resolution))

    def _verify_measurement_types(self):
        """
        Verifies MeasurementType identifiers found in the import file against EDD and external
        databases.  If errors occur, lookups are aborted after EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT
        failed lookups are performed.
        """
        # TODO: current EDD model implementations don't allow us to distinguish between different
        # types of errors in linked applications (e.g. connection errors vs permissions errors
        # vs identifier verified not found...consider adding additional complexity + transparency)

        # by default log progress (and eventually report to user) every ~5%
        progress_incr = getattr(settings, "EDD_IMPORT_MTYPE_LOOKUP_PROGRESS_PERCENT", 5)
        progress = ProgressReporter(
            self._import, len(self._parsed.mtypes), "measurements", progress_incr
        )

        # extract some data for use during lookups
        category = self._import.category
        mtype_group = category.default_mtype_group
        parsed = self._parsed
        types_count = len(parsed.mtypes)
        types = f": {parsed.mtypes}" if types_count <= 10 else f"{types_count} types"

        # do some logging
        msg = f": {types}" if len(types) < 20 else ""
        logger.debug(
            f'Verifying {types_count} MeasurementTypes for category "{category.name}"=> '
            f'type "{mtype_group}"{msg}'
        )

        # initialize some simple progress reporting
        progress.start()
        err_limit = getattr(settings, "EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT", 0)
        err_count = 0
        aborted = False

        # loop over measurement type names, looking them up in the appropriate place
        for mtype_id in parsed.mtypes:
            try:
                mtype = self._mtype_lookup(mtype_id, mtype_group)
                self._mtype_name_to_type[mtype_id] = mtype
                progress.progress()
            except ValidationError:
                logger.exception(f"Exception verifying MeasurementType id {mtype_id}")

                # track errors and progress
                err_count += 1
                err_class = MTYPE_GROUP_TO_ERR_CLASS.get(mtype_group)
                aborted = err_limit if err_count == err_limit else 0
                add_errors(
                    self._import.uuid, err_class(details=mtype_id, aborted=aborted)
                )
                progress.progress()

                # to stay responsive, stop lookups after a threshold is reached
                if aborted:
                    progress.abort()
                    break
        if not aborted:
            progress.end()

    def _verify_units(self):
        """
        Verifies unit names found in the import file against units in the EDD database.
        """
        # Note, we purposefully DON'T use MeasurementUnit.type_group, since allowed units should be
        # associated with Protocol and MeasurementUnit.type_group should instead be ripped out.
        # Initial implementation here used type_group and ran into trouble with "n/a" units (e.g.
        # OD)  which are incorrectly classified as metabolite (but may still have some code
        # dependencies). Other  yet-unidentified/problematic legacy data may exist.
        units = MeasurementUnit.objects.filter(unit_name__in=self._parsed.units)
        self._unit_name_to_unit = {unit.unit_name: unit for unit in units}
        missing_units = self._parsed.units - self._unit_name_to_unit.keys()

        logger.info(
            f"Found {len(self._unit_name_to_unit)} of {len(self._parsed.units)} units: "
            f"{self._unit_name_to_unit}"
        )

        if missing_units:
            uuid = self._import.uuid
            add_errors(uuid, UnsupportedUnitsError(details=missing_units))

    def _mtype_lookup(self, mtype_id, mtype_group):
        """
        A simple wrapper function to unify the interface for load_or_create() for the various
        MeasurementType subclasses.

        :param mtype_id: the type name to search for...maybe in EDD, maybe in an external database.
            EDD is always checked first.
        :param mtype_group: the MeasurementType.Group identifying which class of MeasurementTypes
            to limit the search to
        :raise ValidationError: if the type couldn't be found or created (for any reason).
            TODO: as a future enhancement, add in more detailed error handling to those methods
            (likely in a parallel implementation to avoid breaking the legacy import).  Also
            consider unifying the interface in the core models.
        """
        if mtype_group == MeasurementType.Group.GENERIC:
            # TODO: limit search to specific types under test.  For now, we purposefully avoid
            # filtering by type_name=Measurementype.Group.GENERIC to allow for bioreactors that
            # contain multiple classes of MeasurementTypes
            try:
                return MeasurementType.objects.get(type_name=mtype_id)
            except ObjectDoesNotExist:
                raise ValidationError(f'Measurement Type "{mtype_id}" not found')
            except MultipleObjectsReturned:
                raise ValidationError(
                    f'Multiple Measurement Types found matching "{mtype_id}"'
                )
        # cast id to string in case it was numeric & converted to an int..e.g. by excel if client
        # left out the "cid:" prefix from a pubchem identifier.  Prevents pattern matching
        # errors below.
        mtype_id = str(mtype_id)
        if mtype_group == MeasurementType.Group.METABOLITE:
            return Metabolite.load_or_create(mtype_id)
        else:
            mtype_class = MTYPE_GROUP_TO_CLASS[mtype_group]
            return mtype_class.load_or_create(mtype_id, self._user)

    def _save_resolved_records(
        self, initial_upload: bool, matched_assays: bool
    ) -> Dict[str, Any]:
        """
        Does some final error checking, then resolves parse results into records that can be easily
        inserted into the database in a follow-on task

        :param initial_upload: true if this is the first upload if this file
        :return: summary data resulting from resolution of this file, and also cached in Redis to
            simplify status checks on subsequent requests to further process it
        """
        cacher = ImportCacheCreator(import_=self._import)

        # provide a bunch of other data needed for cache creation
        cacher.assay_time_err = self._assay_time_err
        cacher.matched_assays = matched_assays
        cacher.parsed = self._parsed
        cacher.loa_name_to_pk = self._loa_name_to_pk
        cacher.assay_pk_to_time = self._assay_pk_to_time
        cacher.mtype_name_to_type = self._mtype_name_to_type
        cacher.unit_name_to_unit = self._unit_name_to_unit
        cacher.assay_name_to_line_pk = self._assay_name_to_line_pk

        # create the cache entries and compute any remaining required inputs, assuming no
        # collisions are detected
        return cacher.save_resolved_import_records(initial_upload)


class ImportCacheCreator:
    """
    Takes a FileParseResult and resolved database state and generates + saves import records
    more conducive to final processing by complete_import_task().  Also performs some final error
    checking that isn't possible until this point in the process -- verifies that no colliding
    records are being added.
    """

    def __init__(self, import_: Import):
        self._import = import_
        self.parsed: FileParseResult = None
        self.assay_time_err: bool = False
        self.loa_name_to_pk: Dict[str, int] = None
        self.matched_assays: bool = None
        self.matched_assays: bool = None
        self.loa_name_to_pk: Dict[str, int] = None
        self.assay_pk_to_time: Dict[int, List[float]] = None
        self.mtype_name_to_type: Dict[str, MeasurementType] = None
        self.unit_name_to_unit: Dict[str, MeasurementUnit] = None
        self.assay_name_to_line_pk = None

    def save_resolved_import_records(self, initial_upload: bool):
        """
        Converts MeasurementParseRecord objects created during the parsing step into JSON to
        send to the final Celery task, merging together parse records that will be stored under
        the same Measurement.

        See also ImportExecutor._load_or_create_measurement()
        """
        import_id = self._import.uuid
        logger.debug(
            f"Caching resolved import data to Redis: {import_id}, initial_upload="
            f"{initial_upload}"
        )

        # use in-memory parse results to build a set of JSON records for final import execution
        import_records_list = self._build_import_records()

        # raise any errors detected during the record build (e.g. duplicate entries detected in
        # the file), but defer raising only errors that refer to missing assay time
        # metadata -- such imports are fine as-is and should be set to Resolved before the error
        # messages get sent re: additional required information before they can be completed
        if (err_type_count(self._import.uuid)) > 1 or not self.assay_time_err:
            raise_errors(self._import.uuid)

        # break import records into pages that conform to the cache page limit settings...we'll
        # respect the settings while they exist, since they have performance impact on final
        # execution, though they'll be used differently after transition to the new import and
        # maybe removed later
        self.paged_series = self._paginate_cache(import_records_list)

        cache_page_size = settings.EDD_IMPORT_PAGE_SIZE
        page_count = math.ceil(len(import_records_list) / cache_page_size)

        redis = ImportBroker()

        if not initial_upload:
            # clear all data from any previous files uploaded for this import
            # Note: set_context below doesn't overwrite
            redis.clear_context(import_id)
            redis.clear_pages(import_id)

        # cache the new data
        for page in self.paged_series:
            redis.add_page(import_id, json.dumps(page, cls=JSONEncoder))

        required_inputs: List[str]
        conflicts: _ConflictSummary
        required_inputs, conflicts = self._compute_required_inputs(import_records_list)

        logger.debug(f"required_inputs {required_inputs}")
        context = {
            "conflicted_from_study": conflicts.from_study,
            "conflicted_from_import": conflicts.from_import,
            "file_has_times": self.parsed.has_all_times,
            "file_has_units": self.parsed.has_all_units,
            "importId": str(import_id),
            "loa_pks": [pk for pk in self.loa_name_to_pk.values()],
            "matched_assays": self.matched_assays,
            "required_post_resolve": required_inputs,
            "total_vals": len(self.parsed.series_data),
            "totalPages": page_count,
            "use_assay_times": self.matched_assays and bool(self.assay_pk_to_time),
        }
        redis.set_context(import_id, json.dumps(context))
        return context

    def _compute_required_inputs(
        self, import_records_list
    ) -> Tuple[List[str], _ConflictSummary]:
        compartment = self._import.compartment
        category = self._import.category
        required_inputs: List[str] = []

        # TODO: verify assumptions here re: auto-selected compartment.
        # status quo is that its only needed for metabolomics, but should be configured in protocol
        if category.name == "Metabolomics" and not compartment:
            required_inputs.append("compartment")
        if not (self.assay_pk_to_time or self.parsed.has_all_times):
            required_inputs.append("time")
            conflicts = _ConflictSummary(from_import=0, from_study=0)
        else:
            conflicts = self._detect_conflicts(import_records_list)
            if conflicts.from_import:
                key = "allow_overwrite" if self.matched_assays else "allow_duplication"
                required_inputs.append(key)

        if not self.parsed.has_all_units:
            required_inputs.append("units")

        return required_inputs, conflicts

    def _detect_conflicts(self, import_records_list) -> _ConflictSummary:
        """
        Inspects all the records for this import and queries the database to detect any existing
        MeasurementValues that will be duplicated or overwritten by importing this data.
        This is important to give the user up-front feedback on the import, or the user can also
        choose to skip this check if an overwrite/duplication is planned.
        """
        matched_assays = self.matched_assays
        import_ = self._import

        # if user has chosen to ignore potential overwrites / duplicates, don't check for them
        if (matched_assays and import_.allow_overwrite) or (
            (not matched_assays) and import_.allow_duplication
        ):
            return _ConflictSummary(from_import=0, from_study=0)

        check = "overwrites" if matched_assays else "duplication"
        logger.info(f"Checking for {check}...")

        conflicted_from_study = 0
        conflicted_from_import = 0
        for import_record in import_records_list:
            values = import_record["data"]

            if not values:
                continue

            # use the same Measurement lookup fields that the final import code does
            measurement_filter = _measurement_search_fields(
                import_record,
                import_.compartment,
                import_.y_units_id,
                via=("measurement",),
            )

            # build up a list of unique x-values (each of which may be an array)
            x: List[float]
            y: List[float]
            for x, _y in values:
                # never runs for line name input
                # since it won't get this far
                # if a line name-based file doesn't contain times
                if not self.parsed.has_all_times:
                    assay_pk = import_record["assay_id"]
                    x = self.assay_pk_to_time[assay_pk]

                # Note: x__in doesn't work as of Django 2.0.9...even explicitly casting each
                # element of x to Decimal before filtering for x__in caused a Postgres type
                # error.
                # So unfortunately we have to do this query inside the loop
                qs = MeasurementValue.objects.filter(
                    study_id=import_.study_id,
                    x=x,
                    measurement__assay__protocol_id=import_.protocol_id,
                )
                if matched_assays:
                    assay_pk = import_record["assay_id"]
                    qs = qs.filter(measurement__assay_id=assay_pk)
                else:
                    line_pk = import_record["line_id"]
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

        return _ConflictSummary(
            from_study=conflicted_from_study, from_import=conflicted_from_import
        )

    def _build_import_records(self) -> List[Dict]:
        """
        Builds records for the final import from MeasurementParseRecords read by the parser.
        Merges import parse records, which often result from separate lines of a file, to store
        values for the same Measurement (assay/line + measurement type + units) combination in a
        single record for final import. Merging avoids bloat in the JSON and also reduces
        repetitive Measurement lookups in downstream processing.

        This merge should always be O(n), and in the best case (e.g. OD measurements over time
        on a single line/assay), would eliminate n-1 downstream Measurement queries.

        :return: the list of import records
        """
        # TODO: add a setting to limit the number of records that can be merged together. this
        #  will limit the size of individual pages in Redis.  Behavior with existing small
        #  datasets should be similar to the legacy import.
        import_records = {}

        # maps ident -> dict(). inner dict maps unique time => list of MeasurementParseRecords.
        # None is a valid time for Proteomics time, which will later be copied from assay metadata
        import_times = collections.defaultdict(lambda: collections.defaultdict(list))
        parse_record: MeasurementParseRecord
        for parse_record in self.parsed.series_data:

            # extract info from the parse record and build a unique ID for the Measurement to be
            # created.
            loa_pk = self.loa_name_to_pk.get(parse_record.loa_name)
            mtype = (
                self.mtype_name_to_type[parse_record.mtype_name]
                if parse_record.mtype_name
                else None
            )
            unit = (
                self.unit_name_to_unit[parse_record.y_unit_name]
                if parse_record.y_unit_name
                else None
            )
            ident = (loa_pk, mtype.pk, unit.pk)

            # merge parse records that match the same ID (but should have different times)
            import_record = import_records.get(ident)
            if not import_record:
                import_record: Dict = self._build_import_record(parse_record)
                import_records[ident] = import_record
            else:
                # merge data in this parse record with others for the same loa/mtype/unit
                import_record["data"].append(parse_record.data)
                import_record["src_ids"].extend(parse_record.src_ids)

            # track the original sources from the parse step for all data that may clash
            # (note None is a valid time, e.g. for formats with no time, where "ident" will
            # uniquely determine time found in assay metadata)
            time = parse_record.data[0][0]
            visited_parse_records = import_times[ident][time]
            visited_parse_records.append(parse_record)

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

        return [record for record in import_records.values()]

    def _build_import_record(self, parse_record) -> Dict:
        """
        Builds a record to be used in the final import...essentially a variant of the parse record
        with string identifiers (e.g. for MeasurementTypes, Units, etc) replaced with primary
        keys or enum values.

        :param parse_record: the parse record, see
            edd_file_importer.parsers.MeasurementParseRecord
        :return: the record
        """
        assay_or_line_pk = self.loa_name_to_pk.get(parse_record.loa_name)
        mtype = (
            self.mtype_name_to_type[parse_record.mtype_name]
            if parse_record.mtype_name
            else None
        )
        x_unit = (
            self.unit_name_to_unit[parse_record.x_unit_name]
            if parse_record.x_unit_name
            else None
        )
        y_unit = (
            self.unit_name_to_unit[parse_record.y_unit_name]
            if parse_record.y_unit_name
            else None
        )

        # build up a list of src_ids for this import record, being tolerant of different src_id
        # storage formats in parser implementations...e.g. many tabular formats will have a 1-1
        # correspondence between rows in the file and resulting MeasurementParseRecords,
        # and a single row number tracing its origin.
        if isinstance(parse_record.src_ids, list):
            src_ids = copy.copy(parse_record.src_ids)
        elif isinstance(parse_record.src_ids, tuple):
            src_ids = []
            src_ids.extend(parse_record.src_ids)
        else:
            src_ids = [parse_record.src_ids]
        import_record = {
            "measurement_id": mtype.pk,
            "compartment": self._import.compartment,
            "x_unit_id": x_unit.pk if x_unit else None,
            "y_unit_id": y_unit.pk if y_unit else None,
            "data": [parse_record.data],
            "format": parse_record.format,
            "src_ids": src_ids,
        }

        if self.matched_assays:
            import_record["assay_id"] = assay_or_line_pk
            import_record["assay_name"] = parse_record.loa_name

            line_pk = self.assay_name_to_line_pk.get(assay_or_line_pk, None)
            if line_pk:
                import_record["line_id"] = line_pk
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
            raise ImportTooLargeError(details=msg)

        for i in range(0, len(import_records), cache_page_size):
            yield import_records[i : i + cache_page_size]

    def _record_record_clash(self, import_time, parse_records):
        """
        Logs an error re: MeasurementParseRecords that resolve to the same (time + line/assay +
        MeasurementType) combination.

        :param import_time: the time
        :param parse_records: the clashing records
        """

        # Merge information about the records' sources in the file to produce a summary of
        # where the problem originated -- e.g., a list of ranges of file rows where the clashing
        # data came from
        colliding_ranges = []
        for record in parse_records:
            colliding_ranges.extend(record.src_ids)
        colliding_ranges = build_src_summary(colliding_ranges, convert_ints=True)
        ranges_str = ", ".join(colliding_ranges)
        details = f"{self.parsed.record_src} {ranges_str}"

        loa_name = parse_records[0].loa_name
        mtype_name = parse_records[0].mtype_name
        add_errors(
            self._import.uuid,
            MeasurementCollisionError(
                subcategory=f"({loa_name}, {mtype_name} @ {import_time}h)",
                details=details,
            ),
        )


MType = namedtuple("MType", ["compartment", "type", "unit"])
NO_TYPE = MType(Measurement.Compartment.UNKNOWN, None, None)


class ImportExecutor:
    """
    Processes cached JSON from the import resolution step to finally insert or update
    database records.
    """

    def __init__(self, import_, user):
        """
        Creates an ImportExecutor

        :param import_: summary data for the import about to be executed
        :param user: the user performing the import
        :raises: PermissionDenied if the user does not have write access to the study
        """
        super().__init__()

        if import_.status != Import.Status.SUBMITTED:
            msg = _(
                "Transition from {start} to {end} is not allowed or "
                "not yet supported"
            ).format(start=import_.status, end=Import.Status.PROCESSING)
            raise_errors(import_.uuid, IllegalTransitionError(details=msg))

        self.import_: Import = import_

        # True if names in import file matched assays, false for lines
        self.matched_assays: bool = False
        self._user = user

        # lookups for line/assay by pk
        self.loa_pks: Set[int] = set()  # unique line or assay pks for the entire import

        # lookup assay by whichever pk was used to find / create them.  it'll consistently be
        # either line or assay pk as defined by matched_assays
        self._assays_by_loa_pk: Dict[int, Assay] = {}

        self._assays_by_pk: Dict[int, Assay] = {}

        self._use_assay_time_meta: bool = False
        self.assay_time_mtype: MetadataType = (
            MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Time"])
        )

        # MeasurementValue counts resulting from this import
        self.total_added: int = 0
        self.total_updated: int = 0

        # total # of import records processed
        self.records_processed: int = 0

        # a best effort to use a logical creation timestamp for data imported...depending on usage,
        # won't apply to all database objects created (e.g. especially if there are multiple calls
        # to import_series_data()
        self._creation_update: Update = None

        self._transaction_cm = None

        if not self.import_.study.user_can_write(user):
            raise PermissionDenied(
                f'{user.username} does not have write access to study "{import_.study.name}"'
            )

    def __enter__(self):
        self._transaction_cm = transaction.atomic(savepoint=True)
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        # commit or abort the transaction
        self._transaction_cm.__exit__(exc_type, exc_value, traceback)

        # if an exception triggered the exit, don't suppress it
        return False

    def _query_line_and_assay_count(self, line_pks):
        """
        Executes a bulk query to get line names and existing assay counts (for this protocol) for
        all lines referenced in this import

        :return a dict of pk -> dict (keys: pk, name, assay_count)
        """

        # cast to tuple to avoid problems passing set / list params
        line_pks = tuple(pk for pk in line_pks)
        logger.info("Querying for lines and assay counts..")

        # build batches of line PK's to avoid performance problems with large boolean conditions
        # in the DB query
        results = {}
        batch_size = getattr(settings, "EDD_IMPORT_BULK_PK_LOOKUP_BATCH", 100)
        line_pk_batches = [
            line_pks[i : i + batch_size] for i in range(0, len(line_pks), batch_size)
        ]
        count = Count("assay", filter=Q(assay__protocol_id=self.import_.protocol_id))

        # query in batches for lines and associated assay counts
        for batch in line_pk_batches:
            qs = Line.objects.filter(pk__in=batch)
            qs = qs.annotate(assay_count=count).values_list(
                "pk", "name", "assay_count", named=True
            )
            for result in qs:
                results[result.pk] = result
        return results

    def parse_context(self, context: Dict[str, Any]):
        """
        Parses context for this import from a dict.  See for example,
        ImportFileHandler._cache_resolved_import() for the code that generates this context.
        """
        logger.debug(f"parse_context(): {context}")
        self._use_assay_time_meta = context["use_assay_times"]
        self.matched_assays = context["matched_assays"]
        self.loa_pks.update(context["loa_pks"])

    def import_series_data(self, series_data):
        """
        Imports data into the study.  Assumption is that parse_context() has already been run or
        that a client has directly set related importer attributes.

        :param series_data: series data to import into the study. Each item is a dict describing
            one or more MeasurementValues to be inserted or updated in the study, and it's assumed
            that all data in the import have been merged together so that only one record exists
            for each Measurement in the import.  See, for example
            ImportFileHandler._merge_import_records()
        :return: a tuple with a summary of MeasurementValue counts in the form (added, updated)
        :raises: EDDImportError if an error occurred during the import
        """
        try:
            if self.import_.status != Import.Status.PROCESSING:
                # set the import status consistently if working outside of the normal EDD pipeline
                self.import_.status = Import.Status.PROCESSING
                self.import_.save()

            self._get_or_create_assays()

            # if earlier setup failed, e.g. duo to missing assay times, raise errors before
            # proceeding
            raise_errors(self.import_.uuid)
            added, updated = self._update_or_create_measurements(series_data)
            self.total_added += added
            self.total_updated += updated

            # raise errors in this batch before allowing the next to proceed
            raise_errors(self.import_.uuid)
            self.records_processed += len(series_data)
        except Exception as e:
            # make certain the import gets updated to FAILED, even if used outside the context of
            # EDD's import pipeline
            self.import_.status = Import.Status.FAILED
            self.import_.save()
            raise e

    def _get_or_create_assays(self):
        """
        Looks up and caches line or assay ID's in bulk for this import.  The import will
        either be
        A) creating new assays, in which case we're looking up line ID's, names, and assays
        counts to inform new assay naming
        B) merging data with existing assay, in which case we're looking up existing assay ID's
        """

        # only look up assays once per import
        if self._assays_by_pk:
            return

        self._creation_update = Update.load_update()

        assays = self.matched_assays
        lookup_ids = self.loa_pks

        start = arrow.utcnow()

        if self.matched_assays:
            # do a bulk query for the assays
            logger.info("Querying for assays..")
            lookup_dict = Assay.objects.in_bulk(lookup_ids)
            self._assays_by_pk = lookup_dict
            self._assays_by_loa_pk = lookup_dict
            end = arrow.utcnow()
            duration = _build_duration(start, end)
            logger.info(f"Done querying assays in {duration}")

            # recheck for time metadata on all the assays..if it exists consistently,
            # we'll use it to inform the import
            if self._use_assay_time_meta:
                for assay in self._assays_by_pk.values():
                    if not assay.metadata_get(self.assay_time_mtype):
                        add_errors(
                            self.import_.uuid, MissingAssayTimeError(details=assay.name)
                        )

        else:
            # query the database for line names and the # of existing assays for this protocol
            logger.info("Querying for lines & assay counts..")
            lookup_dict = self._query_line_and_assay_count(lookup_ids)
            end = arrow.utcnow()
            duration = _build_duration(start, end)
            logger.info(f"Done querying lines in {duration}")

        # fail if there were pk's that weren't found
        if len(lookup_dict) != len(lookup_ids):
            err_class = UnmatchedAssayError if assays else UnmatchedLineError
            not_found = lookup_ids - lookup_dict.keys()
            raise_errors(self.import_.uuid, err_class(details=not_found))
        self.loa_pks = set()

        if self.matched_assays:
            return

        self._create_assays(lookup_dict)

    def _create_assays(self, line_results):
        start = arrow.utcnow()
        logger.info(f"Creating {len(line_results)} new assays...")
        protocol = self.import_.protocol

        # Create assays individually.  Django's bulk_create() won't work for multi-table models
        for line_result in line_results.values():
            line_pk = line_result.pk
            assay_count = line_result.assay_count

            # if there are no assays for this line + protocol, use same name for the assay
            # as for the line so that re-upload of the same file will overwrite
            if assay_count == 0:
                assay_name = line_result.name
            else:
                assay_name = Assay.build_name(line_result, protocol, assay_count + 1)

            assay = Assay.objects.create(
                name=assay_name,
                study_id=self.import_.study_id,
                line_id=line_pk,
                protocol_id=protocol.pk,
            )
            self._assays_by_loa_pk[line_pk] = assay
            self._assays_by_pk[assay.pk] = assay

        end = arrow.utcnow()
        duration = _build_duration(start, end)
        logger.info(f"Done creating {len(line_results)} assays in {duration}")

    def finish_import(self):
        logger.info(
            f"Finishing import of {self.records_processed} records: added "
            f"{self.total_added} and updated {self.total_updated} MeasurementValues"
        )

        if self.total_updated and not self.import_.allow_overwrite:
            # make certain the import gets updated to FAILED, even if ImportExecutor gets used
            # outside the context of EDD's import pipeline
            self.import_.status = Import.Status.FAILED
            self.import_.save()

            err = UnplannedOverwriteError(
                details=_(
                    "No overwrite was planned, but {count} values "
                    "would be overwritten"
                ).format(count=self.total_updated)
            )

            raise_errors(self.import_.uuid, err)

        # save the import status back to the database
        self.import_.status = Import.Status.COMPLETED
        self.import_.save()

        # after importing, force updates of previously-existing assays
        for assay in self._assays_by_pk.values():
            # force refresh of Assay's Update (also saves any changed metadata)
            assay.save(update_fields=["metadata", "updated"])

        # NOTE: we purposefully don't update lines here, though the legacy import did.  The legacy
        # code allowed for updating line metadata during import, but that's no longer an option.
        # Only direct line edits should result in the update timestamp being updated for lines.

        # force update of the study
        self.import_.study.save(update_fields=["metadata", "updated"])

        return self.total_added, self.total_updated

    def _update_or_create_measurements(self, series):
        total_added = 0
        total_updated = 0

        logger.info(
            f"Creating / updating DB for a batch of {len(series)} import records"
        )

        # loop over each item in the cache for this import, which should represent the data to be
        # imported for a unique measurement within the import
        for item in series:
            values_data = item["data"]
            item_key = "assay_id" if self.matched_assays else "line_id"
            loa_pk = item[item_key]
            assay = self._assays_by_loa_pk[loa_pk]
            meas = self._load_or_create_measurement(item, assay)
            added, updated = self._update_values(assay, meas, values_data)
            total_added += added
            total_updated += updated
        return total_added, total_updated

    def _load_or_create_measurement(self, item, assay):
        import_ = self.import_
        find = _measurement_search_fields(
            item, import_.compartment, self.import_.y_units_id
        )
        logger.debug(f"Finding measurements for {find}")
        measurements_qs = assay.measurement_set.filter(**find)

        if measurements_qs.count() > 0:
            meas = measurements_qs[0]  # only SELECT query once.
            meas.save(update_fields=["update_ref"])  # force refresh of Update
            return meas

        # since none existed, create a measurement
        # TODO: update this legacy code to carry over the experimenter from the line/assay if it
        # exists
        find.update(experimenter=self._user, study_id=assay.study_id)
        logger.debug(f"Creating measurement with: {find}")
        return assay.measurement_set.create(**find)

    def _update_values(self, assay, measurement, values_list):
        total_added = 0
        total_updated = 0

        to_create = []
        update = Update.load_update()

        for value in values_list:
            # if configured, use assay time metadata, casting as List[Decimal] to match
            # MeasurementValue.x
            x: List[float]
            if self._use_assay_time_meta:
                x = [assay.metadata_get(self.assay_time_mtype)]
            else:
                x = value[0]
            y: List[float] = value[1]

            logger.debug(f"Updating MeasurementValue at x={x}...")
            updated = measurement.measurementvalue_set.filter(x=x).update(y=y)
            total_updated += updated
            if updated == 0:
                new = MeasurementValue(
                    measurement_id=measurement.pk,
                    study_id=measurement.study_id,
                    x=x,
                    y=y,
                    updated=update,
                )
                to_create.append(new)
                total_added += 1

        batch_size = getattr(settings, "EDD_IMPORT_BULK_CREATE_BATCH_SIZE", None)
        MeasurementValue.objects.bulk_create(to_create, batch_size=batch_size)
        return total_added, total_updated
