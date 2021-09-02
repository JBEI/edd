import dataclasses
import logging
import typing

import arrow
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils.translation import gettext_lazy as _

from edd.notify.backend import RedisBroker
from main import models

from . import exceptions, reporting
from .broker import LoadRequest
from .notify import WsBroker

logger = logging.getLogger(__name__)


class ImportExecutor:
    """Performs the database upsert operations to complete data loading request."""

    def __init__(self, load: LoadRequest, user):
        """
        Creates an ImportExecutor

        :param load: LoadRequest object ready for import
        :param user: the user performing the import
        :raises PermissionDenied: if the user does not have write access to the study
        """
        self.load = load
        self.user = user

        # True if names in import file matched assays, false for lines
        self.matched_assays: bool = False

        # lookups for line/assay by pk
        # unique line or assay pks for the entire import
        self.loa_pks: typing.Set[int] = set()

        # lookup assay by whichever pk was used to find / create them.
        # it'll consistently be either line or assay pk as defined by matched_assays
        self._assays_by_loa_pk: typing.Dict[int, models.Assay] = {}
        self._assays_by_pk: typing.Dict[int, models.Assay] = {}

        self._use_assay_time_meta: bool = False
        self.assay_time_mtype = models.MetadataType.system("Time")
        # MeasurementValue counts resulting from this import
        self.total_added: int = 0
        self.total_updated: int = 0

    def start(self):
        # not ready outside of these states
        if self.load.status not in (
            LoadRequest.Status.READY,
            LoadRequest.Status.RESOLVED,
            LoadRequest.Status.ABORTED,
            LoadRequest.Status.FAILED,
        ):
            start = str(self.load.status)
            end = str(LoadRequest.Status.PROCESSING)
            message = _("Transition from {start} to {end} is not allowed.").format(
                start=start, end=end
            )
            reporting.raise_errors(
                self.load.request, exceptions.IllegalTransitionError(details=message)
            )
        if not self.load.transition(LoadRequest.Status.PROCESSING):
            raise exceptions.IllegalTransitionError()

    def parse_context(self, context: typing.Dict[str, typing.Any]):
        """Parses context for this import from a dict."""
        self._use_assay_time_meta = context["use_assay_times"]
        self.matched_assays = context["matched_assays"]
        self.loa_pks.update(context["loa_pks"])

    def import_series_data(self, series_data):
        """
        Imports data into the study.

        Assumption is that parse_context() has already been run or that a
        client has directly set related importer attributes.

        :param series_data: series data to import into the study. Each item is
            a dict describing one or more MeasurementValues to be inserted or
            updated in the study, and it's assumed that all data in the import
            have been merged together so that only one record exists for each
            Measurement in the import. See, for example
            ImportFileHandler._merge_import_records()
        :return: a 2-tuple of counts in the form (added, updated)
        :raises exceptions.EDDImportError: if an error occurred during the import
        :raises exceptions.ExecutionWarning: if transitioning the LoadRequest fails
        """
        if self.load.status != LoadRequest.Status.PROCESSING:
            raise exceptions.IllegalTransitionError()
        try:
            self._get_or_create_assays()
            # if earlier setup failed, e.g. due to missing assay times,
            # raise errors before proceeding
            reporting.raise_errors(self.load.request)
            added, updated = self._update_or_create_measurements(series_data)
            self.total_added += added
            self.total_updated += updated
            # raise errors in this batch before allowing the next to proceed
            reporting.raise_errors(self.load.request)
        except Exception as e:
            self.load.transition(LoadRequest.Status.FAILED)
            raise e

    def finish_import(self):
        if self.total_updated and not self.load.allow_overwrite:
            self.load.transition(LoadRequest.Status.FAILED)
            err = exceptions.UnplannedOverwriteError(
                details=_(
                    "No overwrite was planned, but {count} values "
                    "would be overwritten"
                ).format(count=self.total_updated)
            )
            reporting.raise_errors(self.load.request, err)

        self.load.transition(LoadRequest.Status.COMPLETED)
        # after importing, force updates of previously-existing assays
        for assay in self._assays_by_pk.values():
            # force refresh of Assay's Update (also saves any changed metadata)
            assay.save(update_fields=["metadata", "updated"])

        # NOTE: we purposefully don't update lines here, though the legacy import did. The legacy
        # code allowed for updating line metadata during import, but that's no longer an option.
        # Only direct line edits should result in the update timestamp being updated for lines.

        # force update of the study
        self.load.study.save(update_fields=["metadata", "updated"])
        return self.total_added, self.total_updated

    def _get_or_create_assays(self):
        # Looks up and caches line or assay ID's in bulk for this import.

        # The import will either be:
        #     A) creating new assays, in which case we're looking up line IDs,
        #         names, and assays counts to inform new assay naming
        #     B) merging data with existing assay, in which case we're looking up
        #         existing assay IDs

        # only look up assays once per import
        if self._assays_by_pk:
            return

        if self.matched_assays:
            # do a bulk query for the assays
            lookup_dict = models.Assay.objects.in_bulk(self.loa_pks)
            self._assays_by_pk = lookup_dict
            self._assays_by_loa_pk = lookup_dict
            # recheck for time metadata on all the assays..if it exists consistently,
            # we'll use it to inform the import
            self._set_time_from_metadata()

            # fail if there were pk's that weren't found
            if len(lookup_dict) != len(self.loa_pks):
                not_found = self.loa_pks - lookup_dict.keys()
                reporting.raise_errors(
                    self.load.request,
                    exceptions.UnmatchedAssayError(details=not_found),
                )
            self.loa_pks = set()
        else:
            # query the database for line names and the
            # count of existing assays for this protocol
            lookup_dict = self._query_line_and_assay_count(self.loa_pks)
            # fail if there were pk's that weren't found
            if len(lookup_dict) != len(self.loa_pks):
                not_found = self.loa_pks - lookup_dict.keys()
                reporting.raise_errors(
                    self.load.request, exceptions.UnmatchedLineError(details=not_found),
                )
            self.loa_pks = set()
            self._create_assays(lookup_dict)

    def _set_time_from_metadata(self):
        # recheck for time metadata on all the assays...
        # if it exists consistently, we'll use it to inform the import
        if self._use_assay_time_meta:
            for assay in self._assays_by_pk.values():
                if not assay.metadata_get(self.assay_time_mtype):
                    reporting.add_errors(
                        self.load.request,
                        exceptions.MissingAssayTimeError(details=assay.name),
                    )

    def _create_assays(self, line_results):
        start = arrow.utcnow()
        logger.info(f"Creating {len(line_results)} new assays...")
        # querying once
        study = self.load.study
        protocol = self.load.protocol

        # Create assays individually.
        # Django's bulk_create() won't work for multi-table models
        for line_result in line_results.values():
            line_pk = line_result.pk
            assay_count = line_result.assay_count
            # if there are no assays for this line + protocol, use same name for the assay
            # as for the line so that re-upload of the same file will overwrite
            if assay_count == 0:
                assay_name = line_result.name
            else:
                assay_name = models.Assay.build_name(
                    line_result, protocol, assay_count + 1
                )
            assay = models.Assay.objects.create(
                name=assay_name,
                study_id=study.pk,
                line_id=line_pk,
                protocol_id=protocol.pk,
            )
            self._assays_by_loa_pk[line_pk] = assay
            self._assays_by_pk[assay.pk] = assay
        end = arrow.utcnow()
        duration = end.humanize(start, only_distance=True, granularity="second")
        logger.info(f"Done creating {len(line_results)} assays in {duration}")

    def _query_line_and_assay_count(self, line_pks):
        # Executes a bulk query to get line names
        # and existing assay counts (for this protocol)
        # for all lines referenced in this import

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
        count = Count("assay", filter=Q(assay__protocol=self.load.protocol))

        # query in batches for lines and associated assay counts
        for batch in line_pk_batches:
            qs = models.Line.objects.filter(pk__in=batch)
            qs = qs.annotate(assay_count=count).values_list(
                "pk", "name", "assay_count", named=True
            )
            for result in qs:
                results[result.pk] = result
        return results

    def _update_or_create_measurements(self, series):
        total_added = 0
        total_updated = 0

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
        find = {
            "active": True,
            "compartment": item.get("compartment", self.load.compartment),
            "measurement_type_id": item.get("measurement_id"),
            "measurement_format": item.get("format"),
            "x_units_id": item.get("x_unit_id"),
            "y_units_id": item.get("y_unit_id"),
        }
        measurements_qs = assay.measurement_set.filter(**find)

        if measurements_qs.count() > 0:
            # only SELECT query once
            measurement = measurements_qs[0]
            # force refresh of Update
            measurement.save(update_fields=["update_ref"])
            return measurement

        # since none existed, create a measurement
        # TODO: update this to carry over the experimenter from the line/assay
        # if it exists
        find.update(experimenter=self.user, study_id=assay.study_id)
        return assay.measurement_set.create(**find)

    def _update_values(self, assay, measurement, values_list):
        total_added = 0
        total_updated = 0
        update = models.Update.load_update()
        for value in values_list:
            # if configured, use assay time metadata
            if self._use_assay_time_meta:
                x = [assay.metadata_get(self.assay_time_mtype)]
            else:
                x = value[0]
            y = value[1]
            value, created = measurement.measurementvalue_set.update_or_create(
                study_id=measurement.study_id, x=x, defaults={"y": y, "updated": update}
            )
            if created:
                total_added += 1
            else:
                total_updated += 1
        return total_added, total_updated


@dataclasses.dataclass
class DispatchHelper:
    load: LoadRequest
    user: get_user_model()

    def wizard_complete(self, *, added=None, updated=None):
        notify = RedisBroker(self.user)
        ws = WsBroker(self.user)
        study = self.load.study
        request_uuid = self.load.request
        status = str(self.load.status)
        if added and updated:
            changed = _("Added {added} values and updated {updated}.")
        elif updated:
            changed = _("Updated {updated} values.")
        elif added:
            changed = _("Added {added} values.")
        else:
            changed = _("No values were modified.")
        changed = changed.format(added=added, updated=updated)
        message = _("Finished loading data into {study}. {changed}")
        # this one goes to the bitbucket if user navigated away
        ws.notify(
            message.format(study=study.name, changed=changed),
            tags=["import-status-update"],
            payload={"uuid": request_uuid, "status": status},
        )
        # this one sticks around if the user leaves + comes back
        notify.notify(
            message.format(study=study.name, changed=changed),
            tags=["import-status-update"],
            payload={"uuid": request_uuid, "status": status},
        )

    def wizard_needs_input(self):
        ws = WsBroker(self.user)
        study = self.load.study
        request_uuid = self.load.request
        status = str(self.load.status)
        # this is a fallback if somehow called *without* any warnings or errors
        message = _("Could not load data into {study}.")
        if reporting.warning_count(request_uuid):
            message = _("Acknowledge warnings before loading data into {study}.")
        # when there are errors, that takes precedence
        if reporting.error_count(request_uuid):
            message = _("Resolve errors before loading data into {study}.")
        summary = reporting.build_messages_summary(request_uuid)
        ws.notify(
            message.format(study=study.name),
            tags=["import-status-update"],
            payload={"uuid": request_uuid, "status": status, **summary},
        )

    def wizard_problem(self):
        ws = WsBroker(self.user)
        message = _("There was a problem loading data into {study}.")
        study = self.load.study
        request_uuid = self.load.request
        status = str(self.load.status)
        payload = {
            "status": status,
            "uuid": request_uuid,
            **reporting.build_messages_summary(request_uuid),
        }
        ws.notify(
            message.format(study=study.name),
            tags=["import-status-update"],
            payload=payload,
        )

    def wizard_ready(self):
        ws = WsBroker(self.user)
        message = _("Your data is ready save to {study}.")
        study = self.load.study
        request_uuid = self.load.request
        status = str(self.load.status)
        ws.notify(
            message.format(study=study.name),
            tags=["import-status-update"],
            payload={"uuid": request_uuid, "status": status},
        )
