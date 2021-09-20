import json
import logging
import re
import traceback
import warnings
from collections import namedtuple

import arrow
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http.request import HttpRequest
from django.utils.translation import gettext as _
from threadlocals.threadlocals import set_thread_variable

from main import models

from . import exceptions
from .broker import ImportBroker

logger = logging.getLogger(__name__)
MType = namedtuple("MType", ["compartment", "type", "unit"])
NO_TYPE = MType(models.Measurement.Compartment.UNKNOWN, None, None)


class TableMode:
    PROTEOMICS = "pr"
    SKYLINE = "skyline"
    TRANSCRIPTOMICS = "tr"


class TableImport:
    """
    Object to handle processing of data POSTed to /study/{id}/import view and add
    measurements to the database.
    """

    def __init__(self, study, user):
        """
        Creates an import handler.

        :param study: the target study for import
        :param user: the user performing the import
        :raises: PermissionDenied if the user does not have write access to the study
        """

        # context for how import data are processed
        self.mode = None
        self.master_compartment = models.Measurement.Compartment.UNKNOWN
        self.master_mtype_id = None
        # EDD bootstrap sets "n/a" units as ID 1
        self.master_unit_id = 1
        self.replace = False

        self._study = study
        self._user = user
        # lookups for line/assay by names
        self._line_assay_lookup = {}
        self._line_lookup = {}
        self._meta_lookup = {}
        self._valid_protocol = {}
        # lookups for line/assay by IDs
        self._line_by_id = {}
        self._assay_by_id = {}
        # end up looking for hours repeatedly, just load once at init
        self._hours = models.MeasurementUnit.objects.get(unit_name="hours")
        if not self._study.user_can_write(user):
            # TODO uncovered
            raise PermissionDenied(
                f'{user.username} does not have write access to study "{study.name}"'
            )
            # END uncovered

    def parse_context(self, context):
        """
        Takes a dict of miscellaneous control flags from the import front-end,
        setting the corresponding attributes on this import object. The complete
        list of flags is out of scope of this function, but the list of flags
        this function looks for are:

            - "datalayout": radio buttons from Step 1 of front-end, values one of:
                "std", "skyline", "tr", "hplc", "mdv", "biolector"
            - "masterMCompValue": autocomplete dropdown from Step 4, for the
                compartment to use for all imported points. Corresponds to values
                from main.models.Measurement.Compartment.CHOICES: 0, 1, 2
            - "masterMTypeValue": autocomplete dropdown from Step 4, for the
                type to use for all imported points. Corresponds to primary key
                of main.models.MeasurementType
            - "masterMUnitsValue": autocomplete dropdown from Step 4, for the
                y-units to use for all imported points. Corresponds to primary
                key of main.models.MeasurementUnit
            - "writemode": radio buttons for merge/replace in Step 1, value is
                either "m" (for merge) or "r" (for replace)
        """
        self.mode = context.get("datalayout", None)
        self.master_compartment = context.get("masterMCompValue", None)
        # some import modes will send an empty string for master_compartment
        if not self.master_compartment:
            self.master_compartment = models.Measurement.Compartment.UNKNOWN
        self.master_mtype_id = context.get("masterMTypeValue", None)
        self.master_unit_id = context.get("masterMUnitsValue", 1)
        # some import modes will send an empty string for master_unit_id
        if not self.master_unit_id:
            self.master_unit_id = 1
        self.replace = context.get("writemode", None) == "r"

    def import_series_data(self, series_data):
        """
        Imports a list of measurement values into the study.

        An item in the series data is a dict serialized from the TypeScript
        class ResolvedImportSet:
            - "kind": unused
            - "hint": hint from front-end that a measurement type belongs to
                a group from main.models.MeasurementType.Group
            - "line_name": name picked for line by file parser
            - "assay_name": name picked for assay by file parser
            - "measurement_name": name for measurement type
            - "metadata_by_name": unused
            - "protocol_id": primary key of main.models.Protocol used for measurement
            - "line_id": primary key of main.models.Line used for measurement
            - "assay_id": primary key of main.models.Assay used for measurement
            - "measurement_id": primary key of main.models.MeasurementType used for measurement
            - "compartment_id": value of main.models.MeasurementType.Compartment
            - "units_id": primary key of main.models.MeasurementUnit for y-units
            - "metadata_by_id": dict of main.models.MetadataType keys to arbitrary values
            - "data": a list of 2-tuples of x,y values; each x and y can be a string or number

        :param series_data: list of individual measurement values to import
        :return: a tuple with a summary of measurement counts in the form (added, updated)
        """
        try:
            self.check_series_points(series_data)
            self.init_lines_and_assays(series_data)
            return self.create_measurements(series_data)
        # TODO uncovered
        except exceptions.LoadError:
            raise
        except Exception as e:
            raise exceptions.LoadError(
                "There was a problem processing import data"
            ) from e
        # END uncovered

    def finish_import(self):
        # after importing, force updates of previously-existing lines and assays
        for assay in self._assay_by_id.values():
            # force refresh of Assay's Update (also saves any changed metadata)
            # TODO uncovered
            assay.save(update_fields=["metadata", "updated"])
            # END uncovered
        for line in self._line_by_id.values():
            # force refresh of Update (also saves any changed metadata)
            line.save(update_fields=["metadata", "updated"])
        # and force update of the study
        self._study.save(update_fields=["metadata", "updated"])

    def check_series_points(self, series):
        """
        Checks that each item in the series has some data or metadata, and sets a
        'nothing to import' value for the item when there is no data/metadata to add.
        """
        for item in series:
            points = item.get("data", [])
            meta = item.get("metadata_by_id", {})
            for meta_id in meta:
                # TODO uncovered
                # don't care about return value here
                self._metatype(meta_id)
                # END uncovered
            if len(points) == 0 and len(meta) == 0:
                # TODO uncovered
                item["nothing_to_import"] = True
                # END uncovered

    def init_lines_and_assays(self, series):
        """
        Client-side code detects labels for assays/lines, and allows the user to select
        an "ID" for each label; these ids are passed along in each set and are used to resolve
        actual Line and Assay instances.
        """
        for item in series:
            item["assay_obj"] = self._init_item_assay(item)

    def _init_item_assay(self, item):
        assay = None
        assay_id = item.get("assay_id", None)
        assay_name = item.get("assay_name", None)
        if assay_id is None:
            # TODO uncovered
            logger.warning("Import set has undefined assay_id field.")
            item["invalid_fields"] = True
            # END uncovered
        elif assay_id in self._assay_by_id:
            # TODO uncovered
            assay = self._assay_by_id.get(assay_id)
            # END uncovered
        elif assay_id not in ["new", "named_or_new"]:
            # attempt to lookup existing assay
            # TODO uncovered
            try:
                assay = models.Assay.objects.get(
                    pk=assay_id, line__study_id=self._study.pk
                )
                self._assay_by_id[assay_id] = assay
            except models.Assay.DoesNotExist:
                logger.warning(
                    f"Import set cannot load Assay,Study: {assay_id},{self._study.pk}"
                )
                item["invalid_fields"] = True
            # END uncovered
        else:
            # At this point we know we need to create an Assay, or reference one we created
            # earlier. The question is, for which Line and Protocol? Now protocol_id is essential,
            # so we check it.
            protocol = self._init_item_protocol(item)
            line = self._init_item_line(item)
            if protocol is not None and line is not None:
                if assay_name is None or assay_name.strip() == "":
                    # if we have no name, 'named_or_new' and 'new' are treated the same
                    # TODO uncovered
                    index = line.new_assay_number(protocol)
                    assay_name = models.Assay.build_name(line, protocol, index)
                    # END uncovered
                key = (line.id, assay_name)
                if key in self._line_assay_lookup:
                    assay = self._line_assay_lookup[key]
                else:
                    assay = line.assay_set.create(
                        name=assay_name,
                        protocol=protocol,
                        study_id=line.study_id,
                        experimenter=self._user,
                    )
                    logger.info(f"Created new Assay {assay.id}:{assay_name}")
                    self._line_assay_lookup[key] = assay
        return assay

    def _init_item_line(self, item):
        line = None
        line_id = item.get("line_id", None)
        line_name = item.get("line_name", None)
        if line_id is None:
            # TODO uncovered
            logger.warning(
                "Import set needs new Assay but has undefined line_id field."
            )
            item["invalid_fields"] = True
            # END uncovered
        elif line_id == "new":
            # If the label is 'None' we attempt to locate (or if missing, create) a Line named
            # 'New Line'.
            # (If a user wants a new Line created but has not specified a name, it means we have
            # no way of distinguishing one new Line request in a multi-set import from any other.
            # So the only sane behavior is to place all the sets under one Line.)
            # TODO uncovered
            if line_name is None or line_name.strip() == "":
                line_name = _("New Line")
            if line_name in self._line_lookup:
                line = self._line_lookup[line_name]
            else:
                line = self._study.line_set.create(
                    name=line_name, contact=self._user, experimenter=self._user
                )
                self._line_lookup[line_name] = line
                logger.info(f"Created new Line {line.id}:{line.name}")
            # END uncovered
        elif line_id in self._line_by_id:
            line = self._line_by_id.get(line_id)
        else:
            try:
                line = models.Line.objects.get(pk=line_id, study_id=self._study.pk)
                self._line_by_id[line_id] = line
            # TODO uncovered
            except models.Line.DoesNotExist:
                logger.warning(
                    "Import set cannot load Line,Study: %(line_id)s,%(study_id)s"
                    % {"line_id": line_id, "study_id": self._study.pk}
                )
                item["invalid_fields"] = True
            # END uncovered
        return line

    def _init_item_protocol(self, item):
        protocol_id = item.get("protocol_id", None)
        if protocol_id is None:
            # TODO uncovered
            logger.warning(
                "Import set needs new Assay, but has undefined protocol_id field."
            )
            item["invalid_fields"] = True
            # END uncovered
        elif protocol_id not in self._valid_protocol:
            # when protocol ID valid, map to itself, otherwise map to None
            protocol = None
            try:
                protocol = models.Protocol.objects.get(pk=protocol_id)
            # TODO uncovered
            except models.Protocol.DoesNotExist:
                pass
            # END uncovered
            self._valid_protocol[protocol_id] = protocol
        result = self._valid_protocol.get(protocol_id, None)
        if result is None:
            # TODO uncovered
            logger.warning("Import set cannot load protocol %s" % (protocol_id))
            item["invalid_fields"] = True
            # END uncovered
        return result

    def create_measurements(self, series):
        added = 0
        updated = 0
        # TODO: During a standard-size biolector import (~50000 measurement values) this loop runs
        # very slowly on my test machine, consistently taking an entire second per set (approx 300
        # values each). To an end user, this makes the submission appear to hang for over a
        # minute, which might make them behave erratically...

        # TODO: try doing loop twice, first with models.Measurement.objects.bulk_create()
        # then with models.MeasurementValue.objects.bulk_create()
        for (index, item) in enumerate(series):
            points = item.get("data", [])
            meta = item.get("metadata_by_id", {})
            if item.get("nothing_to_import", False):
                # TODO uncovered
                logger.warning(f"Skipped set {index} because it has no data")
                # END uncovered
            elif item.get("invalid_fields", False):
                # TODO uncovered
                logger.warning(f"Skipped set {index} because it has invalid fields")
                # END uncovered
            elif item.get("assay_obj", None) is None:
                # TODO uncovered
                logger.warning(f"Skipped set {index} because no assay could be loaded")
                # END uncovered
            else:
                assay = item["assay_obj"]
                record = self._load_measurement_record(item)
                (points_added, points_updated) = self._process_measurement_points(
                    record, points
                )
                added += points_added
                updated += points_updated
                self._process_metadata(assay, meta)
        return (added, updated)

    def _load_measurement_record(self, item):
        assay = item["assay_obj"]
        points = item.get("data", [])
        mtype = self._mtype(item)

        find = {
            "active": True,
            "compartment": mtype.compartment,
            "measurement_type_id": mtype.type,
            "measurement_format": self._mtype_guess_format(points),
            "x_units": self._hours,
            "y_units_id": mtype.unit,
        }
        try:
            records = assay.measurement_set.filter(**find)
        # TODO uncovered
        except Exception as e:
            raise exceptions.LoadError(
                f"Failed looking up existing measurements for {find}"
            ) from e
        # END uncovered

        if records.count() > 0:
            # TODO uncovered
            if self.replace:
                records.delete()
            else:
                # only SELECT query once
                record = records[0]
                # force refresh of Update
                record.save(update_fields=["update_ref"])
                return record
            # END uncovered
        find.update(experimenter=self._user, study_id=assay.study_id)
        return assay.measurement_set.create(**find)

    def _process_measurement_points(self, record, points):
        total_added = 0
        total_updated = 0
        for x, y in points:
            (xvalue, yvalue) = (self._extract_value(x), self._extract_value(y))
            obj, created = record.measurementvalue_set.update_or_create(
                study_id=record.study_id, x=xvalue, defaults={"y": yvalue}
            )
            if created:
                total_added += 1
            else:
                # TODO uncovered
                total_updated += 1
                # END uncovered
        return (total_added, total_updated)

    def _process_metadata(self, assay, meta):
        if len(meta) > 0:
            # TODO uncovered
            if self.replace:
                # would be simpler to do assay.metadata.clear()
                # but we only want to replace types included in import data
                for metatype in self._meta_lookup.values():
                    if metatype.pk in assay.metadata:
                        del assay.metadata[metatype.pk]
                    elif metatype.pk in assay.line.metadata:
                        del assay.line.metadata[metatype.pk]
            for meta_id, value in meta.items():
                metatype = self._metatype(meta_id)
                if metatype is not None:
                    if metatype.for_line():
                        assay.line.metadata[metatype.pk] = value
                    elif metatype.for_protocol():
                        assay.metadata[metatype.pk] = value
            # END uncovered

    def _extract_value(self, value):
        # make sure input is string first, split on slash or colon, and give back array of numbers
        try:
            return list(map(float, re.split("/|:", str(value).replace(",", ""))))
        # TODO uncovered
        except ValueError:
            warnings.warn(f'Value "{value}" could not be interpreted as a number')
        return []
        # END uncovered

    def _load_compartment(self, item):
        compartment = item.get("compartment_id", self.master_compartment)
        if not compartment:
            # replace empty values with default
            compartment = self.master_compartment
        return compartment

    def _load_hint(self, item):
        return item.get("hint", self.mode)

    def _load_name(self, item):
        name = item.get("measurement_name", None)
        # TODO uncovered branch here, never run with missing measurement_name
        if name:
            # drop any non-ascii characters; copying values from e.g. Google search
            # would include some invisible unicode that screws with pattern matching
            name = name.encode("ascii", "ignore").decode("utf-8")
        return name

    def _load_type_id(self, item):
        return item.get("measurement_id", self.master_mtype_id)

    def _load_unit(self, item):
        return item.get("units_id", self.master_unit_id)

    def _metatype(self, meta_id):
        # TODO uncovered
        if meta_id not in self._meta_lookup:
            try:
                self._meta_lookup[meta_id] = models.MetadataType.objects.get(pk=meta_id)
            except models.MetadataType.DoesNotExist:
                logger.warning("No MetadataType found for %s" % meta_id)
        return self._meta_lookup.get(meta_id, None)
        # END uncovered

    def _mtype(self, item):
        """
        Attempts to infer the measurement type of the input item from the
        import mode specified in the input / in Step 1 of the import GUI.

        :param item: a dictionary containing the JSON data for a single
            measurement item sent from the front end
        :return: the measurement type
        """
        compartment = self._load_compartment(item)
        units_id = self._load_unit(item)
        mtype_fn_lookup = {
            TableMode.PROTEOMICS: self._mtype_proteomics,
            TableMode.TRANSCRIPTOMICS: self._mtype_transcriptomics,
            models.MeasurementType.Group.GENEID: self._mtype_transcriptomics,
            models.MeasurementType.Group.PROTEINID: self._mtype_proteomics,
        }
        mtype_fn = mtype_fn_lookup.get(self._load_hint(item), self._mtype_default)
        type_id = mtype_fn(item)
        return MType(compartment, type_id, units_id)

    def _mtype_default(self, item):
        type_id = self._load_type_id(item)
        # if type_id is not set, assume it's a lookup pattern
        if not type_id:
            for lookup in [self._mtype_metabolomics, self._mtype_proteomics]:
                try:
                    return lookup(item)
                except ValidationError:
                    pass
            # TODO uncovered
            name = self._load_name(item)
            raise ValidationError(
                _(
                    "No existing type matched for {name} and EDD cannot interpret as "
                    "a metabolite or protein ID."
                ).format(name=name)
            )
            # END uncovered
        return type_id

    def _mtype_metabolomics(self, item):
        measurement_name = self._load_name(item)
        metabolite = models.Metabolite.load_or_create(measurement_name)
        # TODO uncovered -- above always raises exceptions in current tests
        return metabolite.pk
        # END uncovered

    def _mtype_proteomics(self, item):
        measurement_name = self._load_name(item)
        protein = models.ProteinIdentifier.load_or_create(measurement_name, self._user)
        return protein.pk

    def _mtype_transcriptomics(self, item):
        # TODO uncovered
        measurement_name = self._load_name(item)
        gene = models.GeneIdentifier.load_or_create(measurement_name, self._user)
        return gene.pk
        # END uncovered

    def _mtype_guess_format(self, points):
        if self.mode == "mdv":
            # TODO uncovered
            # carbon ratios are vectors
            return models.Measurement.Format.VECTOR
            # END uncovered
        elif self.mode in (TableMode.TRANSCRIPTOMICS, TableMode.PROTEOMICS):
            # TODO uncovered
            # always single values
            return models.Measurement.Format.SCALAR
            # END uncovered
        elif len(points):
            # if first value looks like carbon ratio (vector), treat all as vector
            (x, y) = points[0]
            # several potential inputs to handle: list, string, numeric
            if isinstance(y, list):
                # TODO uncovered
                return models.Measurement.Format.VECTOR
                # END uncovered
            elif isinstance(y, str) and ("/" in y or ":" in y or "|" in y):
                # TODO uncovered
                return models.Measurement.Format.VECTOR
                # END uncovered
        return models.Measurement.Format.SCALAR


class TableProcessor:
    """Handles the processing of a tabular import."""

    def __init__(self, study, user, import_id):
        self.study = study
        self.user = user
        self.import_id = import_id
        self.added = 0
        self.updated = 0

    def run(self):
        broker = ImportBroker()
        # load global context for the import
        self.params = json.loads(broker.load_context(self.import_id))
        # load paged series data
        pages = broker.load_pages(self.import_id)
        # make sure created objects have a consistent Update object
        self._initialize_update()
        try:
            self._stopwatch_start()
            # do the import
            importer = TableImport(self.study, self.user)
            importer.parse_context(self.params)

            with transaction.atomic(savepoint=False):
                for page in pages:
                    parsed_page = json.loads(page)
                    added, updated = importer.import_series_data(parsed_page)
                    self.added += added
                    self.updated += updated
                importer.finish_import()

            self.protocols = list(importer._valid_protocol.values())
            self.lines = list(importer._line_by_id.values())
            self.lines = self.lines + list(importer._line_lookup.values())
        finally:
            self._cleanup_update()

    def send_errors(self, notifications, error):
        # tasks module depends on this module, so cannot import at top level
        from .tasks import send_import_failure_email, send_import_failure_email_admins

        duration = self._stopwatch_duration()
        trace = "\n\t".join(traceback.format_exc().splitlines())
        send_import_failure_email_admins.delay(
            self.study.pk, self.user.pk, self.import_id, duration, str(error), trace,
        )
        if hasattr(self, "params") and self.params.get("emailWhenComplete", False):
            send_import_failure_email.delay(
                self.study.pk, self.user.pk, duration, str(error),
            )
        message = _(
            "Failed import to {study}, EDD encountered this problem: {e}"
        ).format(study=self.study.name, e=error)
        notifications.notify(message, tags=("legacy-import-message",))
        notifications.mark_read(self.import_id)

    def send_notifications(self, notifications):
        # tasks module depends on this module, so cannot import at top level
        from .tasks import send_import_completion_email

        # if requested, notify user of completion (e.g. for a large import)
        if self.params.get("emailWhenComplete", False):
            send_import_completion_email.delay(
                self.study.pk,
                self.user.pk,
                self.added,
                self.updated,
                self._stopwatch_duration(),
            )
        # send notifications via websocket
        message = _(
            "Finished import to {study}: {total_added} added and {total_updated} "
            "updated measurements.".format(
                study=self.study.name,
                total_added=self.added,
                total_updated=self.updated,
            )
        )
        notifications.notify(message, tags=("legacy-import-message",))
        notifications.mark_read(self.import_id)

    def _cleanup_update(self):
        set_thread_variable("request", None)

    def _initialize_update(self):
        # set a fake request object with update info
        fake_request = HttpRequest()
        if "update_id" in self.params:
            update_id = self.params.get("update_id")
            fake_request.update_obj = models.Update.objects.get(pk=update_id)
        else:
            fake_request.update_obj = models.Update.load_update(user=self.user)
        set_thread_variable("request", fake_request)

    def _stopwatch_duration(self):
        if getattr(self, "start", None):
            return self.start.humanize(only_distance=True)
        return _("a reasonable amount of time")

    def _stopwatch_start(self):
        self.start = arrow.utcnow()
