# coding: utf-8
"""
Views for running exports of data from EDD.
"""

import logging

from django.http import HttpResponse
from django.utils.translation import ugettext as _
from django.views import generic

from edd.notify.backend import RedisBroker

from .. import tasks
from ..export import forms as export_forms
from ..export.broker import ExportBroker
from ..export.sbml import SbmlExport
from ..export.table import ExportSelection

logger = logging.getLogger(__name__)


class EDDExportView(generic.TemplateView):
    """ Base view for exporting EDD information. """

    study = None
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
        """ Override in child classes to specify alternate templates. """
        return ["main/export.html"]

    def init_forms(self, request, payload):
        fallback = {"studyId": [self.study.pk]} if self.study else None
        select_form = export_forms.ExportSelectionForm(
            data=payload, user=request.user, fallback=fallback
        )
        try:
            self._selection = select_form.get_selection()
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        # END uncovered
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
            # TODO: uncovered code
            self.submit_export(request, context)
            # END uncovered
        return self.render_to_response(context)

    def render_to_response(self, context, **kwargs):
        download = context.get("download", False)
        if download:
            # TODO: uncovered code
            broker = ExportBroker(context["user_id"])
            name = broker.load_export_name(download)
            response = HttpResponse(
                broker.load_export(download), content_type="text/csv"
            )
            response["Content-Disposition"] = f'attachment; filename="{name}.csv"'
            return response
            # END uncovered
        return super().render_to_response(context, **kwargs)

    def submit_export(self, request, context):
        # TODO: uncovered code
        raise NotImplementedError(
            "Override submit_export in EDDExportView-derived classes"
        )
        # END uncovered


class ExportView(EDDExportView):
    """ View to export EDD information in a table/CSV format. """

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        context.update(option_form=None)
        try:
            initial = export_forms.ExportOptionForm.initial_from_user_settings(
                request.user
            )
            option_form = export_forms.ExportOptionForm(
                data=payload, initial=initial, selection=self.selection
            )
            context.update(option_form=option_form)
            if option_form.is_valid():
                self._export_ok = True
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        # END uncovered
        return context

    def submit_export(self, request, context):
        # TODO: uncovered code
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
        # END uncovered


class WorklistView(EDDExportView):
    """ View to export lines in a worklist template. """

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ["main/worklist.html"]

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        worklist_form = export_forms.WorklistForm()
        context.update(
            defaults_form=worklist_form.defaults_form,
            flush_form=worklist_form.flush_form,
            worklist_form=worklist_form,
        )
        try:
            worklist_form = export_forms.WorklistForm(data=payload)
            context.update(
                defaults_form=worklist_form.defaults_form,
                flush_form=worklist_form.flush_form,
                worklist_form=worklist_form,
            )
            if worklist_form.is_valid():
                self._export_ok = True
        # TODO: uncovered code
        except Exception as e:
            logger.exception(f"Failed to validate forms for export: {e}")
        # END uncovered
        return context

    def submit_export(self, request, context):
        # TODO: uncovered code
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
        # END uncovered


class SbmlView(EDDExportView):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.sbml_export = None

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ["main/sbml_export.html"]

    def init_forms(self, request, payload):
        context = super().init_forms(request, payload)
        self.sbml_export = SbmlExport(self.selection)
        return self.sbml_export.init_forms(payload, context)

    def render_to_response(self, context, **kwargs):
        download = context.get("download", False)
        if download and self.sbml_export:
            # TODO: uncovered code
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
            # END uncovered
        return super().render_to_response(context, **kwargs)
