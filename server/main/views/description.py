"""Views for individual Study Description actions."""

import logging
import uuid
from http import HTTPStatus

from django.contrib import messages
from django.db import transaction
from django.http import HttpResponseRedirect, JsonResponse
from django.template.response import TemplateResponse
from django.utils.translation import gettext as _
from django.views import generic

from edd import utilities
from edd.export.forms import ExportSelectionForm

from .. import forms, models, signals
from .mixins import StudyObjectMixin

logger = logging.getLogger(__name__)


class DescriptionMixin(StudyObjectMixin):
    """
    Mixin class extending the mixin for arbitrary Study records, specifically
    for description views of a Study. Provides factories for building forms.
    """

    def build_line_form(
        self,
        *,
        bulk=False,
        initial=None,
        instance=None,
        lines=None,
    ):
        study = self.get_object()
        if lines is not None and (count := lines.count()):
            bulk = count > 1
            initial = forms.ModifyLineForm.initial_from_lines(lines)
        # only bind POST data if *not* providing initial values
        data = self.request.POST if initial is None else None
        return forms.ModifyLineForm(
            bulk=bulk,
            data=data,
            initial=initial,
            instance=instance,
            study=study,
        )

    def build_select_form(self):
        return ExportSelectionForm(
            data=self.request.POST or None,
            exclude_disabled=False,
            user=self.request.user,
        )


class StudyDescriptionView(DescriptionMixin, generic.DetailView):
    """
    Study description page; displays Line info and allows for manipulating
    details of a Study.
    """

    template_name = "main/study-description.html"

    def get_context_data(self, **kwargs):
        # prefs = self.user.profile.preferences
        return super().get_context_data(
            show_table_dropzone_help=True,
            showinglines=True,
            **kwargs,
        )


class StudyDescriptionAction(DescriptionMixin, generic.DetailView):
    """
    Base class for "action" views of the Study Description page. Many buttons
    on the page trigger actions on the Study, or items within the Study, while
    not requiring any page redirect or content updates.
    """

    http_method_names = ["head", "post"]

    def execute_action(self, study, selection):
        raise NotImplementedError()

    def invalid_selection_message(self):
        raise NotImplementedError()

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = self.build_select_form()
        if not form.is_valid():
            return JsonResponse(
                {"error": self.invalid_selection_message()},
                encoder=utilities.JSONEncoder,
                status=HTTPStatus.BAD_REQUEST,
            )
        return self.execute_action(study, form.selection)


class StudyDescriptionPartial(DescriptionMixin, generic.DetailView):
    """
    Base class for "partial" views of the Study Description page. There are
    multiple sections to the page that may update independently. Each section
    can replace itself with a partial update with AJAX, or redirect back to
    the Overview without scripting.
    """

    default_error_message = _(
        "Something went wrong with your update. "
        "Please try again, or contact support."
    )

    def get_context_data(self, **kwargs):
        return super().get_context_data(study=self.get_object(), **kwargs)

    def error(self, message=default_error_message, **kwargs):
        """
        If the view is inline, send a rendered template response. Otherwise,
        add an error message to the messages framework and redirect to the
        main description view.
        """
        if self.isAjax():
            return self.render_to_response(
                self.get_context_data(**kwargs),
                status=HTTPStatus.BAD_REQUEST,
            )
        messages.error(self.request, message)
        return self._redirect()

    def failed(self, message):
        """
        If the view is inline, send an HTML error fragment. Otherwise, add an
        error message to the messages framework and redirect to the main
        description view.
        """
        if self.isAjax():
            return TemplateResponse(
                self.request,
                "main/include/error_message.html",
                {"message": message},
                status=HTTPStatus.BAD_REQUEST,
            )
        messages.error(self.request, message)
        return self._redirect()

    def isAjax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"

    def success(self, **kwargs):
        """
        If the view is inline, send a JSON document from the keyword arguments.
        Otherwise, redirect to the main description view.
        """
        if self.isAjax():
            return JsonResponse(kwargs, encoder=utilities.JSONEncoder)
        return self._redirect()

    def update(self, **kwargs):
        """
        If the view is inline,  send a rendered template response. Otherwise,
        redirect to the main description view.
        """
        if self.isAjax():
            return self.render_to_response(self.get_context_data(**kwargs))
        return self._redirect()

    def _redirect(self):
        return HttpResponseRedirect(self.study_reverse("main:lines"))


class InitialModifyLineView(DescriptionMixin, generic.DetailView):
    """Display a form to change Line records."""

    http_method_names = ["head", "post"]
    template_error = "main/include/error_message.html"
    template_name = "main/include/studydesc-line.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = self.build_select_form()
        if form.is_valid():
            lines = form.selection.lines.filter(study_id=study.id)
            line_form = self.build_line_form(lines=lines)
            context = self.get_context_data(
                count=len(lines),
                line_form=line_form,
                meta_form=forms.MetadataUpdateForm(
                    includeField=False,
                    initial=forms.MetadataUpdateForm.initial_from_items(lines),
                    typeFilter=models.MetadataType.LINE,
                ),
                select_form=form,
                url_action=self.study_reverse("main:line_edit"),
            )
            return self.render_to_response(context)
        return TemplateResponse(
            self.request,
            self.template_error,
            {"message": _("EDD encountered a problem preparing Lines to edit.")},
            status=HTTPStatus.BAD_REQUEST,
        )


class BaseLineSave(StudyDescriptionPartial):
    """Base View that saves Line records."""

    template_name = "main/include/studydesc-line.html"
    url_name_action = "main:new_line"

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            url_action=self.study_reverse(self.url_name_action),
            **kwargs,
        )

    def _process_metadata(self):
        """
        Handles parsing of selected metadata fields to edit, then extracts the
        changing metadata to use in creation or updating of a Line record.
        """
        init_form = forms.MetadataSelectForm(
            data=self.request.POST or None,
            includeField=False,
            typeFilter=models.MetadataType.LINE,
        )
        if init_form.is_valid():
            form = forms.MetadataUpdateForm(
                data=self.request.POST,
                includeField=False,
                typeFilter=models.MetadataType.LINE,
                types=init_form.selection,
            )
            return form
        return init_form


class CreateLineView(BaseLineSave):
    """Create a Line record."""

    def get(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        types = models.MetadataType.all_types_on_queryset(study.line_set)
        types = types.exclude(input_type="replicate")
        return self.update(
            count=0,
            line_form=self.build_line_form(initial={}),
            meta_form=forms.MetadataUpdateForm(
                includeField=False,
                typeFilter=models.MetadataType.LINE,
                types=types,
            ),
        )

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        meta_form = self._process_metadata()
        if meta_form.is_valid():
            to_create = models.Line(study=study, metadata=meta_form.metadata)
        else:
            messages.error(request, _("Failed to process metadata"))
            to_create = models.Line(study=study)
        form = self.build_line_form(instance=to_create)
        if form.is_valid():
            created = form.save()
            signals.study_described.send(
                sender=self.__class__,
                study=study,
                user=request.user,
                count=1,
            )
            return self.success(lineId=created.id)
        return self.error(
            count=0,
            line_form=form,
            message=_("EDD could not save line information."),
            meta_form=meta_form,
        )


class ModifyLineView(BaseLineSave):
    """Edit Line view on Study description page."""

    http_method_names = ["head", "post"]
    url_name_action = "main:line_edit"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = self.build_select_form()
        meta_form = self._process_metadata()
        self._error_form = None
        if form.is_valid():
            lines = form.selection.lines.filter(study_id=study.id)
            if self._save_lines(lines, meta_form):
                return self.success()
            return self.error(
                count=len(lines),
                message=_("EDD failed to save lines."),
                line_form=self._error_form,
                meta_form=meta_form,
                select_form=form,
            )
        return self.failed(_("EDD could not verify lines to modify."))

    def _save_lines(self, lines, meta):
        if meta.is_valid():
            bulk = lines.count() > 1
            with transaction.atomic():
                if all(self._save_one_line(line, meta, bulk) for line in lines):
                    return True
                transaction.set_rollback(True)
        return False

    def _save_one_line(self, line, meta, bulk):
        form = self.build_line_form(bulk=bulk, instance=line)
        if form.is_valid():
            # apply metadata changes, then re-create the form with updated line
            meta.apply_metadata(line)
            line.save()
            form.save()
            return True
        self._error_form = form
        return False


class InitialAddAssayView(DescriptionMixin, generic.DetailView):
    """Display a form to add Assay records."""

    http_method_names = ["head", "post"]
    template_error = "main/include/error_message.html"
    template_name = "main/include/studydesc-assay.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        form = self.build_select_form()
        if form.is_valid():
            context = self.get_context_data(
                assay_form=forms.AddAssayForm(line=None),
                select_form=form,
            )
            return self.render_to_response(context)
        return TemplateResponse(
            self.request,
            self.template_error,
            {"message": _("Must select at least one Line to add Assay.")},
            status=HTTPStatus.BAD_REQUEST,
        )


class AddAssayView(StudyDescriptionPartial):
    """Add Assay view on Study description page."""

    http_method_names = ["head", "post"]
    template_name = "main/include/studydesc-assay.html"

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            select_form=self.build_select_form(),
            **kwargs,
        )

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = self.build_select_form()
        if form.is_valid():
            lines = form.selection.lines.filter(study_id=study.id)
            if self._save_assays(lines):
                return self.success()
            return self.error(message=_("EDD failed to add assays."))
        return self.failed(message=_("Must select at least one Line to add Assay."))

    def _save_assays(self, lines):
        with transaction.atomic():
            if all(self._save_one_assay(line) for line in lines):
                return True
            transaction.set_rollback(True)
        return False

    def _save_one_assay(self, line):
        assay = models.Assay(study=line.study, line=line)
        form = forms.AddAssayForm(
            data=self.request.POST,
            instance=assay,
            line=line,
        )
        if form.is_valid():
            assay.save()
            return True
        return False


class CloneLineView(StudyDescriptionAction):
    """Clone Line view on Study description page."""

    def execute_action(self, study, selection):
        # TODO accept a count input for multiple copies
        # TODO accept a name format for clones
        clones = [line.clone_to_study(study) for line in selection.lines]
        with transaction.atomic():
            study.line_set.add(*clones, bulk=False)
        signals.study_described.send(
            sender=self.__class__,
            study=study,
            user=self.request.user,
            count=len(clones),
        )
        return JsonResponse({}, encoder=utilities.JSONEncoder)

    def invalid_selection_message(self):
        return _("Must select at least one Line to clone.")


class GroupLineView(StudyDescriptionAction):
    """
    Group Line view on Study description page, for creating a group of
    replicates from Line records. Can also remove replicate groupings by
    initializing with `ungroup=True`.
    """

    ungroup = False

    def execute_action(self, study, selection):
        replicate = models.MetadataType.system("Replicate")
        value = uuid.uuid4().hex
        with transaction.atomic():
            for line in selection.lines:
                if self.ungroup:
                    line.metadata_clear(replicate)
                else:
                    line.metadata_add(replicate, value, append=False)
                line.save()
        return JsonResponse({}, encoder=utilities.JSONEncoder)

    def invalid_selection_message(self):
        if self.ungroup:
            return _("Must select at least one Line to remove from group.")
        return _("Must select at least one Line to group.")


class RemoveLineView(StudyDescriptionAction):
    """
    Remove Line view on Study description page. Can also restore removed Lines
    by initializing with `restore=True`.
    """

    restore = False

    def execute_action(self, study, selection):
        with transaction.atomic():
            # true deletion when no measurements are saved
            if not self.restore and selection.measurements.count() == 0:
                ids = selection.lines.values_list("pk", flat=True)
                count, details = models.Line.objects.filter(pk__in=ids).delete()
                count = details[models.Line._meta.label]
            # otherwise, flip the active flag
            else:
                count = selection.lines.update(active=self.restore)
                # cascade deactivation to assays and measurements
                # NOTE: ExportSelectionForm already filters out deactivated elements,
                #   so this will _NOT_ re-activate objects from previously
                #   deactivated lines.
                selection.assays.update(active=self.restore)
                selection.measurements.update(active=self.restore)
            signals.study_described.send(
                sender=self.__class__,
                study=study,
                user=self.request.user,
                count=count if self.restore else -count,
            )
        return JsonResponse({}, encoder=utilities.JSONEncoder)

    def invalid_selection_message(self):
        if self.restore:
            return _("Must select at least one Line to restore.")
        return _("Must select at least one Line to remove.")
