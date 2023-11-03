"""Views handling loading measurements into EDD."""

import functools
import logging
from http import HTTPStatus

from django.conf import settings
from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect, JsonResponse
from django.template.response import TemplateResponse
from django.utils.html import format_html
from django.utils.translation import gettext as _
from django.views.generic import DetailView

from edd.utilities import JSONEncoder
from main.views.study import StudyObjectMixin

from . import broker, exceptions, forms, tasks

logger = logging.getLogger(__name__)


class ReactlessImportView(StudyObjectMixin, DetailView):
    def get_context_data(self, **kwargs):
        # enforce permissions check...
        self.check_write_permission(self.request)
        return super().get_context_data(
            load_request=self.get_load_request(),
            study_url=self.study_reverse("main:detail"),
            uuid=self.kwargs.get("uuid", None),
            **kwargs,
        )

    def get_load_request(self):
        if lr := getattr(self, "load_request", None):
            return lr
        if uuid := self.kwargs.get("uuid", None):
            try:
                self.load_request = broker.LoadRequest.fetch(uuid)
                self.load_request.check_study(self.get_object())
                return self.load_request
            except exceptions.InvalidLoadRequestError:
                translation = _(
                    "You cannot access the current import request. "
                    'Please <a href="{url}">start a new one</a>.'
                )
                message = format_html(
                    translation,
                    url=self.study_reverse("main:load:start"),
                )
                messages.warning(self.request, message)
                raise PermissionDenied()
        return None

    def isAjax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"


class ImportStartView(ReactlessImportView):
    tab_key = "start"
    template_name = "edd/load/start.html"

    def get_context_data(self, start=None, **kwargs):
        if start is None:
            start = self.get_start_form()
        return super().get_context_data(start=start, **kwargs)

    def get_start_form(self):
        if load_request := self.get_load_request():
            return forms.StartLoadForm.from_load_request(load_request)
        return forms.StartLoadForm()

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = forms.StartLoadForm(data=request.POST)
        if form.is_valid():
            lr = form.start(study)
            url = self.study_reverse("main:load:upload", uuid=lr.request_uuid)
            return HttpResponseRedirect(url)
        return self.render_to_response(
            self.get_context_data(start=form),
            status=HTTPStatus.BAD_REQUEST,
        )


class ImportUploadView(ReactlessImportView):
    tab_key = "upload"
    template_name = "edd/load/upload.html"

    def post(self, request, *args, **kwargs):
        try:
            self.check_write_permission(request)
            lr = self.get_load_request()
            if lr.upload(request.FILES):
                tasks.submit_process(lr, request.user)
                return self.buildOKResponse(lr)
            messages.warning(
                request,
                _("EDD could not recognize an uploaded file. Please try again."),
            )
        except Exception as e:
            logger.error(e)
            messages.error(
                request,
                _("There was a problem processing your upload."),
            )
        return self.buildErrorResponse()

    def buildOKResponse(self, lr):
        url = self.study_reverse("main:load:interpret", uuid=lr.request_uuid)
        if self.isAjax():
            return JsonResponse({"url": url, **lr.progress}, encoder=JSONEncoder)
        return HttpResponseRedirect(url)

    def buildErrorResponse(self):
        context = self.get_context_data()
        if self.isAjax():
            # empty response, frontend should reload to see messages
            return JsonResponse(
                data={},
                encoder=JSONEncoder,
                status=HTTPStatus.BAD_REQUEST,
            )
        return self.render_to_response(
            context,
            status=HTTPStatus.BAD_REQUEST,
        )


class ImportInterpretView(ReactlessImportView):
    tab_key = "interpret"
    template_name = "edd/load/interpret.html"

    def get(self, request, *args, **kwargs):
        if self.isAjax():
            context = self.get_context_data()
            return TemplateResponse(
                self.request,
                self.get_subtemplate(),
                context,
            )
        return super().get(request, *args, **kwargs)

    def get_context_data(self, form=None, **kwargs):
        lr = self.get_load_request()
        progress = lr.progress
        if form is None and lr.is_interpret_ready:
            form = self.get_token_form()
        previous_url, next_url = self.get_page_urls(progress["tokens"])
        return super().get_context_data(
            form=form,
            next_url=next_url,
            previous_url=previous_url,
            progress=progress,
            subtemplate=self.get_subtemplate(),
            **kwargs,
        )

    def get_page_urls(self, token_count):
        page = self.kwargs.get("page", 0)
        uuid = self.kwargs.get("uuid", None)
        next_url = None
        previous_url = None
        if page > 0:
            previous_url = self.study_reverse(
                "main:load:interpret-page",
                page=page - 1,
                uuid=uuid,
            )
        next_page = page + 1
        if next_page * self.page_size < token_count:
            next_url = self.study_reverse(
                "main:load:interpret-page",
                page=next_page,
                uuid=uuid,
            )
        return previous_url, next_url

    def get_subtemplate(self):
        lr = self.get_load_request()
        progress = lr.progress
        if progress["status"] in ("Created", "Updating"):
            return "edd/load/interpret-progress.html"
        elif progress["unresolved"] > 0:
            return "edd/load/interpret-resolve.html"
        elif progress["resolved"] > 0:
            return "edd/load/interpret-commit.html"
        return "edd/load/interpret-error.html"

    def get_token_form(self):
        try:
            lr = self.get_load_request()
            start, end = self.get_token_range()
            return forms.ResolveTokensForm(load_request=lr, start=start, end=end)
        except ValueError:
            return None

    def get_token_range(self):
        page = self.kwargs.get("page", 0)
        start = page * self.page_size
        end = start + self.page_size
        return start, end

    @functools.cached_property
    def page_size(self):
        # this could be a per-user setting, instead of global
        return getattr(settings, "EDD_WIZARD_TOKENS_PER_PAGE", 20)

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        lr = self.get_load_request()
        if "abort" in request.POST:
            return self._do_abort(request, lr)
        elif "save" in request.POST:
            return self._do_save(request, lr)
        form = forms.ResolveTokensForm(load_request=lr, data=request.POST)
        if form.is_valid():
            messages.success(
                request,
                _("Updating import with provided information."),
            )
            payload_key = lr.form_payload_save(request.POST)
            tasks.submit_update(
                lr,
                payload_key,
                request.user,
                save_when_done="save" in request.POST,
            )
            url = self.study_reverse("main:load:interpret", uuid=lr.request_uuid)
            return HttpResponseRedirect(url)
        return self.render_to_response(
            self.get_context_data(form=form),
            status=HTTPStatus.BAD_REQUEST,
        )

    def _do_abort(self, request, load_request):
        load_request.retire()
        messages.success(
            request,
            _("Import is cancelled, please start from the beginning."),
        )
        url = self.study_reverse("main:load:start")
        return HttpResponseRedirect(url)

    def _do_save(self, request, load_request):
        if tasks.submit_save(load_request, request.user):
            url = self.study_reverse("main:load:save", uuid=load_request.request_uuid)
            return HttpResponseRedirect(url)
        messages.warning(
            request,
            _("EDD detected an inconsistent state, please try again."),
        )
        return self.render_to_response(
            self.get_context_data(),
            status=HTTPStatus.CONFLICT,
        )


class ImportSaveView(ReactlessImportView):
    tab_key = "save"
    template_name = "edd/load/save.html"
