"""
Views for running exports of data from EDD.
"""

import logging

from django.http import HttpResponse
from django.utils.translation import gettext as _
from django.views import generic

from edd.notify.backend import RedisBroker

from . import forms, tasks
from .broker import ExportBroker
from .sbml import SbmlExport
from .table import ExportSelection

logger = logging.getLogger(__name__)


class EDDExportView(generic.TemplateView):
    """Base view for exporting EDD information."""

    _export_ok = False
    _selection = ExportSelection(None)

    def get(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.GET))
        return self.render_to_response(context)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        return context

    def get_selection(self):
        return self._selection

    selection = property(get_selection)

    def get_template_names(self):
        # Override in child classes to specify alternate templates.
        return ["edd/export/export.html"]

    def init_forms(self, request, payload):
        select_form = forms.ExportSelectionForm(data=payload, user=request.user)
        try:
            self._selection = select_form.get_selection()
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        primary = None
        if self.selection.studies[:1]:
            primary = self.selection.studies[0]
        return {
            "download": payload.get("download", None),
            "primary_study": primary,
            "select_form": select_form,
            "selection": self.selection,
            "user_id": request.user.id,
        }

    def post(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.POST))
        if "download" == request.POST.get("action", None):
            self.submit_export(request, context)
            return HttpResponse(status=204)
        return self.render_to_response(context)

    def render_to_response(self, context, **kwargs):
        download = context.get("download", False)
        if download:
            broker = ExportBroker(context["user_id"])
            name = broker.load_export_name(download)
            response = HttpResponse(
                broker.load_export(download), content_type="text/csv"
            )
            response["Content-Disposition"] = f'attachment; filename="{name}.csv"'
            return response
        return super().render_to_response(context, **kwargs)

    def submit_export(self, request, context):
        raise NotImplementedError(
            "Override submit_export in EDDExportView-derived classes"
        )


class ExportView(EDDExportView):
    """View to export EDD information in a table/CSV format."""

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        context.update(option_form=None)
        try:
            initial = forms.ExportOptionForm.initial_from_user_settings(request.user)
            option_form = forms.ExportOptionForm(
                data=payload, initial=initial, selection=self.selection
            )
            context.update(option_form=option_form)
            if option_form.is_valid():
                self._export_ok = True
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        return context

    def submit_export(self, request, context):
        if self._export_ok:
            broker = ExportBroker(request.user.id)
            notifications = RedisBroker(request.user)
            path = broker.save_params(request.POST)
            logger.debug(f"Saved export params to path {path}")
            result = tasks.export_table_task.delay(request.user.id, path)
            # use task ID as notification ID; may replace message when export is complete
            notifications.notify(
                _(
                    "Your export request is submitted. Another message with a "
                    "download link will appear when the export processing is complete."
                ),
                uuid=result.id,
            )


class WorklistView(EDDExportView):
    """View to export lines in a worklist template."""

    def get_template_names(self):
        return ["edd/export/worklist.html"]

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        worklist_form = forms.WorklistForm()
        context.update(
            defaults_form=worklist_form.defaults_form,
            flush_form=worklist_form.flush_form,
            worklist_form=worklist_form,
        )
        try:
            worklist_form = forms.WorklistForm(data=payload)
            context.update(
                defaults_form=worklist_form.defaults_form,
                flush_form=worklist_form.flush_form,
                worklist_form=worklist_form,
            )
            if worklist_form.is_valid():
                self._export_ok = True
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        return context

    def submit_export(self, request, context):
        if self._export_ok:
            broker = ExportBroker(request.user.id)
            notifications = RedisBroker(request.user)
            path = broker.save_params(request.POST)
            result = tasks.export_worklist_task.delay(request.user.id, path)
            # use task ID as notification ID; may replace message when export is complete
            notifications.notify(
                _(
                    "Your worklist request is submitted. Another message with a "
                    "download link will appear when the worklist processing is complete."
                ),
                uuid=result.id,
            )


class SbmlView(EDDExportView):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.sbml_export = None

    def get_template_names(self):
        return ["edd/export/sbml_export.html"]

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        self.sbml_export = SbmlExport(self.selection)
        return self.sbml_export.init_forms(payload, context)

    def render_to_response(self, context, **kwargs):
        download = context.get("download", False)
        if download and self.sbml_export:
            match_form = context.get("match_form", None)
            time_form = context.get("time_form", None)
            if (
                match_form
                and time_form
                and match_form.is_valid()
                and time_form.is_valid()
            ):
                time = time_form.cleaned_data["time_select"]
                response = HttpResponse(
                    self.sbml_export.output(time, match_form.cleaned_data),
                    content_type="application/sbml+xml",
                )
                # set download filename
                filename = time_form.cleaned_data["filename"]
                response["Content-Disposition"] = f'attachment; filename="{filename}"'
                return response
        return super().render_to_response(context, **kwargs)
