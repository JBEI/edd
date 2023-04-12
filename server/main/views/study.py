"""Views for Study records, before Bootstrap 5 conversion."""

import collections
import logging
import uuid

from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render
from django.template.loader import get_template
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views import generic
from requests import codes

from edd.export import forms as export_forms

from .. import forms as edd_forms
from .. import models as edd_models
from ..signals import study_described
from .mixins import StudyObjectMixin

logger = logging.getLogger(__name__)


class StudyDetailBaseView(StudyObjectMixin, generic.DetailView):
    """Study details page, displays line/assay data."""

    def get_actions(self):
        """
        Return a dict mapping action names to functions performing the action. These functions
        may return one of the following values:
            1. True: indicates a change was made; redirects to a GET request
            2. False: indicates no change was made; no redirect
            3. HttpResponse instance: the explicit response to return
            4. view function: another view to handle the request
        """
        return collections.defaultdict(lambda: self.handle_unknown)

    def handle_unknown(self, request, context, *args, **kwargs):
        """Default fallback action handler, displays an error message."""
        messages.error(
            request,
            _("Unknown action, or you do not have permission to modify this study."),
        )
        return False

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        action = request.POST.get("action", None)
        context = self.get_context_data(object=instance, action=action, request=request)
        action_fn = self.get_actions().get(action, self.handle_unknown)
        try:
            view_or_valid = action_fn(request, context, *args, **kwargs)
            if isinstance(view_or_valid, bool):
                # boolean means a response to same page, with flag noting whether form was valid
                return self.post_response(request, context, view_or_valid)
            elif isinstance(view_or_valid, HttpResponse):
                # got a response, directly return
                return view_or_valid
            else:
                # otherwise got a view function, call it
                return view_or_valid(request, *args, **kwargs)
        except PermissionDenied:
            # instead of the generic 403 error page, return to original page with message
            messages.error(
                request, _("You do not have permission to modify this study.")
            )
            return self.render_to_response(context, status=codes.forbidden)

    def post_response(self, request, context, form_valid):
        if form_valid:
            # redirect to the same location to avoid re-submitting forms with back/forward
            return HttpResponseRedirect(request.path)
        # set status code indicating request could not complete from invalid form
        return self.render_to_response(context, status=codes.bad_request)

    def check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(
                _("You do not have permission to modify this study.")
            )


class StudyLinesView(StudyDetailBaseView):
    """Study details displays line data."""

    template_name = "main/study-lines.html"

    def get_actions(self):
        action_lookup = super().get_actions()
        action_lookup.update(
            assay=self.handle_assay,
            clone=self.handle_clone,
            disable=self.handle_delete_line,
            disable_confirm=self.handle_disable,
            enable=self.handle_enable,
            line=self.handle_line,
            replicate=self.handle_replicate,
            unreplicate=self.handle_unreplicate,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        study = self.get_object()
        return super().get_context_data(
            new_assay=edd_forms.AssayForm(prefix="assay", study=study),
            new_line=edd_forms.LineForm(prefix="line", study=study),
            showinglines=True,
            **kwargs,
        )

    def handle_assay(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        if not selectForm.is_valid():
            messages.error(request, _("Must select at least one Line to add Assay."))
            return False
        form = edd_forms.AssayForm(
            request.POST, lines=selectForm.selection.lines, prefix="assay", study=study
        )
        if form.is_valid():
            form.save()
            return True
        context["new_assay"] = form
        return False

    def handle_clone(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        form = export_forms.ExportSelectionForm(data=request.POST, user=request.user)
        study = self.get_object()
        cloned = 0
        if not form.is_valid():
            messages.error(request, _("Failed to validate selection for clone."))
            return False
        for line in form.selection.lines:
            # easy way to clone is just pretend to fill out add line form
            initial = edd_forms.LineForm.initial_from_model(line)
            # update name to indicate which is the clone
            initial["name"] = initial["name"] + " clone"
            clone = edd_forms.LineForm(initial, study=study)
            if clone.is_valid():
                clone.save()
                cloned += 1
        study_described.send(
            sender=self.__class__,
            study=self.get_object(),
            user=request.user,
            count=cloned,
        )
        messages.success(
            request,
            _("Cloned {count} of {total} Lines").format(
                count=cloned, total=form.selection.lines.count()
            ),
        )
        return True

    def handle_enable(self, request, context, *args, **kwargs):
        return self.handle_enable_disable(request, True, **kwargs)

    def handle_delete_line(self, request, context, *args, **kwargs):
        """Sends to a view to confirm deletion."""
        self.check_write_permission(request)
        study = self.get_object()
        form = export_forms.ExportSelectionForm(
            data=request.POST,
            exclude_disabled=False,
            user=request.user,
        )
        if form.is_valid():
            template = get_template("main/confirm_delete.html")
            qs = form.selection.lines.filter(study_id=study.pk)
            c = super().get_context_data(
                cancel_link=reverse("main:lines", kwargs={"slug": study.slug}),
                confirm_action="disable_confirm",
                form=form,
                item_count=qs.count(),
                item_names=qs[:10].values_list("name", flat=True),
                measurement_count=form.selection.measurements.count(),
                typename=_("Line"),
                **kwargs,
            )
            return TemplateResponse(request, template, c)
        return self.handle_unknown(request, context, *args, **kwargs)

    def handle_disable(self, request, context, *args, **kwargs):
        return self.handle_enable_disable(request, False, **kwargs)

    def handle_enable_disable(self, request, active, **kwargs):
        self.check_write_permission(request)
        form = export_forms.ExportSelectionForm(
            data=request.POST,
            exclude_disabled=False,
            user=request.user,
        )
        if form.is_valid():
            with transaction.atomic():
                if not active and form.selection.measurements.count() == 0:
                    # true deletion only if there are zero measurements!
                    line_ids = form.selection.lines.values_list("id", flat=True)
                    count, details = edd_models.Line.objects.filter(
                        id__in=line_ids
                    ).delete()
                    count = details[edd_models.Line._meta.label]
                else:
                    count = form.selection.lines.update(active=active)
                    # cascade deactivation to assays and measurements
                    # NOTE: ExportSelectionForm already filters out deactivated elements,
                    #   so this will _NOT_ re-activate objects from previously
                    #   deactivated lines.
                    form.selection.assays.update(active=active)
                    form.selection.measurements.update(active=active)
                study_described.send(
                    sender=self.__class__,
                    study=self.get_object(),
                    user=request.user,
                    count=count if active else -count,
                )

            action = _("Restored") if active else _("Deleted")
            messages.success(
                request, _("{action} {count} Lines").format(action=action, count=count)
            )
            return True
        messages.error(request, _("Failed to validate selection."))
        return False

    def handle_line(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        if selectForm.is_valid():
            if selectForm.selection.lines.filter(study_id=study.id).exists():
                return self.handle_line_edit(
                    request, context, selectForm.selection.lines
                )
        elif "lineId" in selectForm.cleaned_data:
            # no selection == new line
            return self.handle_line_new(request, context)
        messages.error(request, _("Failed to load line for editing."))
        return False

    def handle_line_edit(self, request, context, lines):
        study = self.get_object()
        total = lines.count()
        saved = 0
        for line in lines:
            form = edd_forms.LineForm(
                request.POST, instance=line, prefix="line", study=study
            )
            # removes fields having disabled bulk edit checkbox
            form.check_bulk_edit()
            if form.is_valid():
                form.save()
                saved += 1
            else:
                context["new_line"] = form
                for error in form.errors.values():
                    messages.warning(request, error)
                break
        messages.success(
            request,
            _("Saved {saved} of {total} Lines").format(saved=saved, total=total),
        )
        return saved > 0

    def handle_line_new(self, request, context):
        form = edd_forms.LineForm(request.POST, prefix="line", study=self.get_object())
        if form.is_valid():
            form.save()
            study_described.send(
                sender=self.__class__,
                study=self.get_object(),
                user=request.user,
                count=1,
            )
            messages.success(
                request, _("Added Line '{name}'").format(name=form["name"].value())
            )
            return True
        context.update(new_line=form)
        return False

    def handle_replicate(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        replicate = edd_models.MetadataType.system("Replicate")
        value = uuid.uuid4().hex
        if selectForm.is_valid():
            for line in selectForm.selection.lines.filter(study_id=study.pk):
                line.metadata_add(replicate, value, append=False)
                line.save()
            return True
        return False

    def handle_unreplicate(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        replicate = edd_models.MetadataType.system("Replicate")
        if selectForm.is_valid():
            for line in selectForm.selection.lines.filter(study_id=study.pk):
                line.metadata_clear(replicate)
                line.save()
            return True
        return False


class StudyDetailView(StudyDetailBaseView):
    """Study details page, displays graph/assay data."""

    template_name = "main/study-data.html"

    def get_actions(self):
        action_lookup = super().get_actions()
        action_lookup.update(
            assay=self.handle_assay_edit,
            disable_assay=self.handle_assay_delete,
            disable_assay_confirm=self.handle_assay_confirm_delete,
            measurement=self.handle_measurement_add,
            measurement_edit=self.handle_measurement_edit,
            measurement_update=self.handle_measurement_edit,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        study = self.get_object()
        return super().get_context_data(
            new_assay=edd_forms.AssayForm(prefix="assay", study=study),
            new_measurement=edd_forms.MeasurementForm(prefix="measurement"),
            # pass along link to get/set personal setting on last view for study
            settinglink=reverse(
                "profile:settings_key",
                kwargs={"key": f"measurement-{study.id}"},
            ),
            showingdata=True,
            **kwargs,
        )

    def handle_assay_confirm_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        form = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user, exclude_disabled=False
        )
        study = self.get_object()
        if form.is_valid():
            # cannot directly use form.selection.assays, as it will include parent assays
            #   for any selected measurements
            if "assayId" in form.cleaned_data:
                qs = form.cleaned_data["assayId"].filter(study_id=study.pk)
                assay_count = qs.update(active=False)
            else:
                # TODO: uncovered
                assay_count = 0
                # END uncovered
            # OK to directly use form.selection.measurements
            qs = form.selection.measurements.filter(study_id=study.pk)
            measurement_count = qs.update(active=False)
            messages.success(
                request,
                _("Deleted {assay} Assays and {measurement} Measurements.").format(
                    assay=assay_count, measurement=measurement_count
                ),
            )
            return True
        messages.error(request, _("Nothing selected to delete."))
        return False

    def handle_assay_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = export_forms.ExportSelectionForm(
            data=request.POST,
            exclude_disabled=False,
            user=request.user,
        )
        if form.is_valid():
            template = get_template("main/confirm_delete.html")
            qs = form.selection.assays.filter(study_id=study.pk)
            c = super().get_context_data(
                cancel_link=reverse("main:detail", kwargs={"slug": study.slug}),
                confirm_action="disable_assay_confirm",
                form=form,
                item_count=qs.count(),
                item_names=qs[:10].values_list("name", flat=True),
                measurement_count=form.selection.measurements.count(),
                typename=_("Assay"),
                **kwargs,
            )
            return TemplateResponse(request, template, c)
        return self.handle_unknown(request, context, *args, **kwargs)

    def handle_assay_edit(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        if not selectForm.is_valid():
            messages.error(request, _("Must select at least one Assay to edit."))
            return False
        total = selectForm.selection.assays.count()
        saved = 0
        for assay in selectForm.selection.assays:
            form = edd_forms.AssayForm(
                data=request.POST,
                instance=assay,
                prefix="assay",
                study=study,
            )
            # removes fields having disabled bulk edit checkbox
            form.check_bulk_edit()
            if form.is_valid():
                form.save()
                saved += 1
            else:
                context["new_assay"] = form
                for error in form.errors.values():
                    messages.warning(request, error)
                break
        messages.success(
            request,
            _("Saved {saved} of {total} Assays").format(saved=saved, total=total),
        )
        return saved > 0

    def handle_measurement_add(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        if not selectForm.is_valid():
            messages.error(
                request, _("Must select at least one Assay to add Measurement.")
            )
            return False
        form = edd_forms.MeasurementForm(
            data=request.POST,
            assays=selectForm.selection.assays,
            prefix="measurement",
            study=study,
        )
        if form.is_valid():
            form.save()
            return True
        context["new_measurement"] = form
        return False

    def handle_measurement_edit(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        selectForm = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user
        )
        if not selectForm.is_valid():
            messages.error(request, _("Nothing selected for edit."))
            return False
        # only pass payload to MeasurementValueFormSet when update button is hit
        form_payload = None
        if request.POST.get("action", None) == "measurement_update":
            form_payload = request.POST
        # query the exact info needed to display
        measures = selectForm.selection.measurements.select_related(
            "assay__protocol", "assay__line", "measurement_type"
        ).order_by("assay__line_id")
        # invert the graph to traverse based on lines first
        inverted = collections.defaultdict(lambda: collections.defaultdict(list))
        # loop over measurements to add formset and to inverted structure
        show_edit = True
        with transaction.atomic():
            for m in measures:
                m.form = edd_forms.MeasurementValueFormSet(
                    data=form_payload,
                    instance=m,
                    prefix=str(m.id),
                    queryset=m.measurementvalue_set.order_by("x"),
                )
                # only try to save when data is there and valid
                save_form = m.form.is_bound and m.form.is_valid()
                # only show edit page if at least one form is not saved
                show_edit = show_edit and not save_form
                if save_form:
                    m.form.save()
                inverted[m.assay.line][m.assay].append(m)
        if show_edit:
            # template doing inverted.items is same as inverted["items"], so disable defaults
            inverted.default_factory = None
            for adict in inverted.values():
                adict.default_factory = None
            return render(
                request,
                "main/edit_measurement.html",
                context={
                    "inverted": inverted,
                    "measures": measures,
                    "study": self.get_object(),
                },
            )
        return True

    def get(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        # redirect to overview page if there are no lines or assays
        if instance.line_set.count() == 0:
            return HttpResponseRedirect(
                reverse("main:overview", kwargs={"slug": instance.slug})
            )
        # redirect to lines page if there are no assays
        if edd_models.Assay.objects.filter(line__study=instance).count() == 0:
            return HttpResponseRedirect(
                reverse("main:lines", kwargs={"slug": instance.slug})
            )
        return super().get(request, *args, **kwargs)
