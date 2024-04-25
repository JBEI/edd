import functools
import logging
from http import HTTPStatus

from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect, JsonResponse
from django.template.response import TemplateResponse
from django.utils.html import format_html
from django.utils.translation import gettext as _
from django.views.generic import DetailView

from edd.utilities import JSONEncoder
from main.views.study import StudyObjectMixin

from .broker import SetupRequest
from .forms import ResolveTokensForm
from .tasks import submit_commit, submit_process, submit_update

logger = logging.getLogger(__name__)


class ExperimentSetupView(StudyObjectMixin, DetailView):
    def is_ajax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"


class SetupUploadView(ExperimentSetupView):
    http_method_names = ["head", "post"]

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        setup = SetupRequest(study_uuid=study.uuid)
        if setup.upload(request.FILES):
            submit_process(setup, request.user)
            message = format_html(
                _("Accepted uploaded file <tt>{filename}</tt>."),
                filename=setup.original_name,
            )
            messages.success(request, message)
            return self._ok_response(setup)
        messages.warning(
            request,
            _("Problem uploading Experiment Setup file, please contact support."),
        )
        return self._error_response()

    def _error_response(self):
        if self.is_ajax():
            # empty response, frontend should reload to see messages
            return JsonResponse(
                data={},
                encoder=JSONEncoder,
                status=HTTPStatus.BAD_REQUEST,
            )
        url = self.study_reverse("main:overview")
        return HttpResponseRedirect(url)

    def _ok_response(self, setup):
        url = self.study_reverse("main:setup:interpret", uuid=setup.request_uuid)
        if self.is_ajax():
            return JsonResponse({"url": url, **setup.progress}, encoder=JSONEncoder)
        return HttpResponseRedirect(url)


class ExperimentSetupInstanceView(ExperimentSetupView):
    def get_context_data(self, **kwargs):
        # enforce permissions check...
        self.check_write_permission(self.request)
        return super().get_context_data(
            setup=self.get_setup_request(),
            study_url=self.study_reverse("main:detail"),
            uuid=self.kwargs.get("uuid", None),
            **kwargs,
        )

    @functools.cache
    def get_setup_request(self):
        try:
            setup = SetupRequest.fetch(self.kwargs["uuid"])
            setup.check_study(self.get_object())
            return setup
        except Exception as e:
            logger.info(f"Raising PermissionDenied because: {e}")
        raise PermissionDenied()


class SetupInterpretView(ExperimentSetupInstanceView):
    template_name = "edd/setup/interpret.html"

    def get(self, request, *args, **kwargs):
        if self.is_ajax():
            context = self.get_context_data()
            subtemplate = self.get_subtemplate()
            return TemplateResponse(self.request, subtemplate, context)
        return super().get(request, *args, **kwargs)

    def get_context_data(self, form=None, **kwargs):
        setup = self.get_setup_request()
        uuid = self.kwargs.get("uuid", None)
        progress = setup.progress
        if form is None:
            form = self.get_token_form()
        return super().get_context_data(
            form=form,
            next_url=self._get_page_next(form, uuid),
            previous_url=self._get_page_previous(form, uuid),
            progress=progress,
            subtemplate=self.get_subtemplate(),
            **kwargs,
        )

    @functools.cache
    def get_subtemplate(self):
        setup = self.get_setup_request()
        progress = setup.progress
        if progress["status"] == "Updating":
            return "edd/setup/interpret-progress.html"
        elif progress["unresolved"] > 0:
            return "edd/setup/interpret-form.html"
        elif progress["resolved"] > 0:
            return "edd/setup/interpret-commit.html"
        return "edd/setup/interpret-error.html"

    def get_token_form(self):
        setup = self.get_setup_request()
        page = self.kwargs.get("page", 1)
        return ResolveTokensForm(setup_request=setup, page=page)

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        setup = self.get_setup_request()
        if "abort" in request.POST:
            return self._do_abort(request, setup)
        elif "save" in request.POST:
            return self._do_save(request, setup)
        form = ResolveTokensForm(setup_request=setup, data=request.POST)
        if form.is_valid():
            payload_key = setup.form_payload_stash(request.POST)
            submit_update(setup, payload_key, request.user)
            messages.success(
                request,
                _("Updating Experiment Setup with provided information."),
            )
            url = self.study_reverse("main:setup:interpret", uuid=setup.request_uuid)
            return HttpResponseRedirect(url)
        return self.render_to_response(
            self.get_context_data(form=form),
            status=HTTPStatus.BAD_REQUEST,
        )

    def _do_abort(self, request, setup_request):
        setup_request.retire()
        messages.success(request, _("Experiment Setup cancelled."))
        url = self.study_reverse("main:overview")
        return HttpResponseRedirect(url)

    def _do_save(self, request, setup_request):
        submit_commit(setup_request, request.user)
        url = self.study_reverse("main:setup:save", uuid=setup_request.request_uuid)
        return HttpResponseRedirect(url)

    def _get_page_next(self, form, uuid):
        if next_page := form.page_next:
            return self.study_reverse(
                "main:setup:interpret-page",
                page=next_page,
                uuid=uuid,
            )

    def _get_page_previous(self, form, uuid):
        if prev_page := form.page_previous:
            return self.study_reverse(
                "main:setup:interpret-page",
                page=prev_page,
                uuid=uuid,
            )


class SetupSaveView(ExperimentSetupInstanceView):
    template_name = "edd/setup/save.html"
