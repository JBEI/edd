"""Views used as AJAX calls by the front-end Typescript code in EDD."""

import logging

from django.db.models import Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.generic.base import TemplateView
from requests import codes

from edd import utilities

from .. import forms, models, query

logger = logging.getLogger(__name__)


def load_study(
    request,
    pk=None,
    slug=None,
    permission_type=models.StudyPermission.CAN_VIEW,
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
        permission = models.Study.access_filter(request.user, access=permission_type)
    if pk is not None:
        return get_object_or_404(models.Study.objects.distinct(), permission, Q(pk=pk))
    elif slug is not None:
        return get_object_or_404(
            models.Study.objects.distinct(), permission, Q(slug=slug)
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


class InlineMetadataPartialView(TemplateView):
    """Handle inline updates to metadata edit/selection forms."""

    http_method_names = ["head", "post"]
    template_name = "main/forms/metadata_select.html"

    def post(self, request, *args, **kwargs):
        init_form = forms.MetadataSelectForm(
            data=self.request.POST,
            includeField=False,
            typeFilter=models.MetadataType.LINE,
        )
        if init_form.is_valid():
            form = forms.MetadataUpdateForm(
                data=init_form.data,
                includeField=False,
                typeFilter=models.MetadataType.LINE,
                types=init_form.selection,
            )
            return self.render_to_response(self.get_context_data(form=form))
        return self.render_to_response(
            self.get_context_data(form=init_form),
            status=codes.bad_request,
        )
