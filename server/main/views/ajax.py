"""
Views used as AJAX calls by the front-end Typescript code in EDD.
"""

import collections
import json
import logging

from django.contrib.postgres.aggregates import ArrayAgg
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count
from django.http import HttpResponse, JsonResponse
from django.views import generic
from requests import codes

from edd import utilities

from .. import models as edd_models
from .. import query
from .study import StudyObjectMixin, load_study

logger = logging.getLogger(__name__)


# /study/<study_id>/measurements/<protocol_id>/
def study_measurements(request, pk=None, slug=None, protocol=None):
    """ Request measurement data in a study. """
    # TODO: uncovered code
    obj = load_study(request, pk=pk, slug=slug)
    measure_types = edd_models.MeasurementType.objects.filter(
        measurement__assay__line__study=obj, measurement__assay__protocol_id=protocol
    ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = edd_models.Measurement.objects.filter(
        assay__line__study=obj,
        assay__protocol_id=protocol,
        active=True,
        assay__line__active=True,
    )
    # Limit the measurements returned to keep browser performance
    measurements = qmeasurements.order_by("id")[:5000]
    total_measures = qmeasurements.values("assay_id").annotate(count=Count("assay_id"))
    measure_list = list(measurements)
    if len(measure_list):
        # only try to pull values when we have measurement objects
        values = edd_models.MeasurementValue.objects.filter(
            measurement__assay__line__study=obj,
            measurement__assay__protocol_id=protocol,
            measurement__active=True,
            measurement__assay__line__active=True,
            measurement__pk__range=(measure_list[0].id, measure_list[-1].id),
        )
    else:
        values = []
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        "total_measures": {
            x["assay_id"]: x.get("count", 0) for x in total_measures if "assay_id" in x
        },
        "types": {t.pk: t.to_json() for t in measure_types},
        "measures": [m.to_json() for m in measure_list],
        "data": value_dict,
    }
    return JsonResponse(payload, encoder=utilities.JSONEncoder)
    # END uncovered


# /study/<study_id>/measurements/<protocol_id>/<assay_id>/
def study_assay_measurements(request, pk=None, slug=None, protocol=None, assay=None):
    """ Request measurement data in a study, for a single assay. """
    # TODO: uncovered code
    obj = load_study(request, pk=pk, slug=slug)
    measure_types = edd_models.MeasurementType.objects.filter(
        measurement__assay__line__study=obj,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
    ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = edd_models.Measurement.objects.filter(
        assay__line__study_id=obj.pk,
        assay__protocol_id=protocol,
        assay=assay,
        active=True,
        assay__active=True,
        assay__line__active=True,
    )
    # Limit the measurements returned to keep browser performant
    measurements = qmeasurements.order_by("id")[:5000]
    total_measures = qmeasurements.values("assay_id").annotate(count=Count("assay_id"))
    measure_list = list(measurements)
    values = edd_models.MeasurementValue.objects.filter(
        measurement__assay__line__study_id=obj.pk,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
        measurement__active=True,
        measurement__assay__active=True,
        measurement__assay__line__active=True,
        measurement__id__range=(measure_list[0].id, measure_list[-1].id),
    )
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        "total_measures": {
            x["assay_id"]: x.get("count", 0) for x in total_measures if "assay_id" in x
        },
        "types": {t.pk: t.to_json() for t in measure_types},
        "measures": [m.to_json() for m in measure_list],
        "data": value_dict,
    }
    return JsonResponse(payload, encoder=utilities.JSONEncoder)
    # END uncovered


# /study/<study_id>/edddata/
def study_edddata(request, pk=None, slug=None):
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client.
    """
    model = load_study(request, pk=pk, slug=slug)
    # TODO: uncovered code
    data_misc = query.get_edddata_misc()
    data_study = query.get_edddata_study(model)
    data_study.update(data_misc)
    return JsonResponse(data_study, encoder=utilities.JSONEncoder)
    # END uncovered


# /study/<study_id>/assaydata/
def study_assay_table_data(request, pk=None, slug=None):
    """ Request information on assays associated with a study. """
    # TODO: uncovered code
    model = load_study(request, pk=pk, slug=slug)
    active_param = request.GET.get("active", None)
    active_value = "true" == active_param if active_param in ("true", "false") else None
    active = edd_models.common.qfilter(value=active_value, fields=["active"])
    existingLines = model.line_set.filter(active)
    existingAssays = edd_models.Assay.objects.filter(active, line__study=model)
    return JsonResponse(
        {
            "ATData": {
                "existingLines": list(existingLines.values("name", "id")),
                "existingAssays": {
                    assays["protocol_id"]: assays["ids"]
                    for assays in existingAssays.values("protocol_id").annotate(
                        ids=ArrayAgg("id")
                    )
                },
            },
            "EDDData": query.get_edddata_study(model),
        },
        encoder=utilities.JSONEncoder,
    )
    # END uncovered


class StudyPermissionJSONView(StudyObjectMixin, generic.detail.BaseDetailView):
    """ Implements a REST-style view for /study/<id-or-slug>/permissions/ """

    def get(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        permissions = [
            permission.to_json() for permission in instance.get_combined_permission()
        ]
        return JsonResponse(permissions, safe=False)

    def head(self, request, *args, **kwargs):
        self.object = self.get_object()
        return HttpResponse(status=codes.ok)

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        self.check_write_permission(request)
        try:
            perms = json.loads(request.POST.get("data", "[]"))
            # make requested changes as a group, or not at all
            with transaction.atomic():
                success = all(
                    self._handle_permission_update(permission_def)
                    for permission_def in perms
                )
                if not success:
                    raise PermissionDenied()
        except PermissionDenied:
            raise
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Error modifying study ({instance}) permissions: {e}")
            return HttpResponse(status=codes.server_error)
        # END uncovered
        return HttpResponse(status=codes.no_content)

    # Treat PUT requests the same as POST
    put = post

    def delete(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        self.check_write_permission(request)
        try:
            # make requested changes as a group, or not at all
            with transaction.atomic():
                instance.everyonepermission_set.all().delete()
                instance.grouppermission_set.all().delete()
                instance.userpermission_set.all().delete()
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Error deleting study ({instance}) permissions: {e}")
            return HttpResponse(status=codes.server_error)
        # END uncovered
        return HttpResponse(status=codes.no_content)

    def _handle_permission_update(self, permission_def):
        # update a permission based on input dict from JSON
        # return False when nothing updated, otherwise True
        instance = self.get_object()
        ptype = permission_def.get("type", None)
        kwargs = dict(study=instance)
        defaults = dict(permission_type=ptype)
        manager = None
        if "group" in permission_def:
            kwargs.update(group_id=permission_def["group"].get("id", 0))
            manager = instance.grouppermission_set
        elif "user" in permission_def:
            kwargs.update(user_id=permission_def["user"].get("id", 0))
            manager = instance.userpermission_set
        elif "public" in permission_def:
            if edd_models.EveryonePermission.can_make_public(self.request.user):
                manager = instance.everyonepermission_set

        if manager is None or ptype is None:
            logger.info(f"Refusing to set permission {permission_def}")
            return False
        elif ptype == edd_models.StudyPermission.NONE:
            manager.filter(**kwargs).delete()
            return True
        else:
            kwargs.update(defaults=defaults)
            manager.update_or_create(**kwargs)
            return True
