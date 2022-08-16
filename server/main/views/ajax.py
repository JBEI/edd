"""Views used as AJAX calls by the front-end Typescript code in EDD."""

import logging

from django.contrib.postgres.aggregates import ArrayAgg
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse

from edd import utilities

from .. import models as edd_models
from .. import query

logger = logging.getLogger(__name__)


def load_study(
    request, pk=None, slug=None, permission_type=edd_models.StudyPermission.CAN_VIEW
):
    """
    Loads a study as a request user; throws a 404 if the study does not exist OR if no valid
    permissions are set for the user on the study.

    :param request: the request loading the study
    :param pk: study's primary key; at least one of pk and slug must be provided
    :param slug: study's slug ID; at least one of pk and slug must be provided
    :param permission_type: required permission for the study access
    """
    permission = Q()
    if not request.user.is_superuser:
        permission = edd_models.Study.access_filter(
            request.user, access=permission_type
        )
    if pk is not None:
        return get_object_or_404(
            edd_models.Study.objects.distinct(), permission, Q(pk=pk)
        )
    elif slug is not None:
        return get_object_or_404(
            edd_models.Study.objects.distinct(), permission, Q(slug=slug)
        )
    raise Http404()


# /study/<study_id>/edddata/
def study_edddata(request, pk=None, slug=None):
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client. Deprecated, use REST APIs.
    """
    model = load_study(request, pk=pk, slug=slug)
    return JsonResponse(query.get_edddata_study(model), encoder=utilities.JSONEncoder)


# /study/<study_id>/assaydata/
def study_assay_table_data(request, pk=None, slug=None):
    """Request information on assays associated with a study."""
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


# /study/<study_id>/access/
def study_access(request, pk=None, slug=None):
    model = load_study(request, pk=pk, slug=slug)
    return JsonResponse(
        {
            "study": {"pk": model.pk, "slug": model.slug, "uuid": model.uuid},
            "urlAssay": reverse("rest:assays-list"),
            "urlCompartment": reverse("rest:compartments-list"),
            "urlLine": reverse("rest:lines-list"),
            "urlMeasurement": reverse("rest:measurements-list"),
            "urlMetadata": reverse("rest:metadata_types-list"),
            "urlProtocol": reverse("rest:protocols-list"),
            "urlType": reverse("rest:types-list"),
            "urlUnit": reverse("rest:units-list"),
            "urlUser": reverse("rest:users-list"),
        },
        encoder=utilities.JSONEncoder,
    )
