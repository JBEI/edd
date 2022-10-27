"""Views dealing with displaying and manipulating Study records."""

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
from .. import redis
from ..signals import study_described

logger = logging.getLogger(__name__)


class StudyObjectMixin(generic.detail.SingleObjectMixin):
    """Mixin class to add to Study views."""

    model = edd_models.Study

    def check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(
                _("You do not have permission to modify this study.")
            )

    def get_context_data(self, **kwargs):
        study = self.get_object()
        lvs = redis.LatestViewedStudies(self.request.user)
        lvs.viewed_study(study)
        return super().get_context_data(
            has_assays=study.assay_set.filter(active=True).exists(),
            has_lines=study.line_set.filter(active=True).exists(),
            writable=study.user_can_write(self.request.user),
            **kwargs,
        )

    def get_object(self, queryset=None):
        """Overrides the base method to curry if there is no filtering queryset."""
        # already looked up object and no filter needed, return previous object
        if hasattr(self, "object") and queryset is None:
            return self.object
        # call parents
        obj = super().get_object(queryset)
        # save parents result if no filtering queryset
        if queryset is None:
            self.object = obj
        return obj

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_superuser:
            return qs
        access = edd_models.Study.access_filter(self.request.user)
        return qs.filter(access, active=True).distinct()


class StudyCreateView(generic.edit.CreateView):
    """View for request to create a Study."""

    form_class = edd_forms.CreateStudyForm
    model = edd_models.Study
    template_name = "main/create_study.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(can_create=edd_models.Study.user_can_create(self.request.user))
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs.update(user=self.request.user)
        return kwargs

    def get_success_url(self):
        return reverse("main:overview", kwargs={"slug": self.object.slug})


class StudyIndexView(StudyCreateView):
    """View for the the index page."""

    template_name = "main/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        lvs = redis.LatestViewedStudies(self.request.user)
        # just doing filter will lose the order
        latest_qs = self.get_queryset().filter(pk__in=lvs)
        # so create a dict of string-casted pk to study
        latest_by_pk = {str(s.pk): s for s in latest_qs}
        # and a mapping of lvs to retain order
        latest = map(lambda pk: latest_by_pk.get(pk, None), lvs)
        # filter out the Nones
        context.update(latest_viewed_studies=list(filter(bool, latest)))
        return context


class StudyAttachmentView(generic.DetailView):
    model = edd_models.Attachment
    pk_url_kwarg = "file_id"
    slug_url_kwarg = None

    def _get_studyview(self):
        # keep a StudyDetailView instance to re-use the code there to find a Study
        if hasattr(self, "_studyview"):
            return self._studyview
        self._studyview = StudyDetailView()
        self._studyview.request = self.request
        self._studyview.args = self.args
        self._studyview.kwargs = self.kwargs
        # SingleObjectMixin depends on an object property being set on views
        self._studyview.object = self._studyview.get_object()
        return self._studyview

    def get_queryset(self):
        # get the default Attachment queryset
        qs = super().get_queryset()
        # use the _studyview to find the Study referenced in the URL
        study = self._get_studyview().get_object()
        # filter on only Attachments on the Study from the URL
        return qs.filter(object_ref=study)

    def get(self, request, *args, **kwargs):
        model = self.object = self.get_object()
        with model.file.open():
            response = HttpResponse(model.file.read(), content_type=model.mime_type)
        response["Content-Disposition"] = f'attachment; filename="{model.filename}"'
        return response

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        studyview = self._get_studyview()
        studyview.check_write_permission(request)
        study = studyview.get_object()
        name = instance.filename
        # remove from storage
        instance.file.delete(False)
        # remove the database record
        instance.delete()
        messages.success(request, _("Deleted attachment {name}.").format(name=name))
        return HttpResponseRedirect(
            reverse("main:overview", kwargs={"slug": study.slug})
        )


class StudyOverviewView(StudyObjectMixin, generic.DetailView):
    """
    Study overview page; displays basic info on a Study--name, description, and
    contact; with comments, attachments, permissions.
    """

    template_name = "main/study-overview.html"

    def get_context_data(self, **kwargs):
        study = self.get_object()
        return super().get_context_data(
            can_make_public=edd_models.EveryonePermission.can_make_public(
                self.request.user,
            ),
            edit_study=edd_forms.ModifyStudyForm(instance=study, prefix="study"),
            new_attach=edd_forms.CreateAttachmentForm(),
            new_comment=edd_forms.CreateCommentForm(),
            permission_form=edd_forms.PermissionForm(study=study),
            permission_none=edd_models.StudyPermission.NONE,
            permission_read=edd_models.StudyPermission.READ,
            permission_write=edd_models.StudyPermission.WRITE,
            showingoverview=True,
            **kwargs,
        )


class StudyOverviewPartial(StudyObjectMixin, generic.DetailView):
    """
    Base class for partial views of the Study Overview page. There are multiple
    sections to the page that may update independently. Each section can
    replace itself with a partial update with AJAX, or redirect back to the
    Overview without scripting.
    """

    inline = False
    partial_error_template = None

    def error_or_redirect(self, context, message=None):
        if self.inline:
            template = get_template(self.partial_error_template)
            return HttpResponse(
                template.render(context),
                status=codes.bad_request,
            )
        elif message:
            messages.error(self.request, message)
        return self._redirect()

    def update_or_redirect(self):
        if self.inline:
            return self.render_to_response(self.get_context_data())
        return self._redirect()

    def _redirect(self):
        study = self.get_object()
        url = reverse("main:overview", kwargs={"slug": study.slug})
        return HttpResponseRedirect(url)


class CreateAttachmentView(StudyOverviewPartial):
    """Handles attaching files to a Study."""

    partial_error_template = "main/include/add-attachment.html"
    template_name = "main/include/attachments.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = edd_forms.CreateAttachmentForm(
            data=request.POST,
            files=request.FILES,
            edd_object=study,
        )
        if form.is_valid():
            form.save()
            return self.update_or_redirect()
        else:
            return self.error_or_redirect(
                {"new_attach": form, "study": study},
                _("Could not attach file."),
            )


class CreateCommentView(StudyOverviewPartial):
    """Handles adding comments to a Study."""

    partial_error_template = "main/include/add-comment.html"
    template_name = "main/include/comments.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = edd_forms.CreateCommentForm(
            data=request.POST,
            edd_object=study,
        )
        if form.is_valid():
            form.save()
            return self.update_or_redirect()
        else:
            return self.error_or_redirect(
                {"new_comment": form, "study": study},
                _("Could not post comment."),
            )


class ModifyStudyView(StudyOverviewPartial):
    """Handles updates to direct Study information."""

    partial_error_template = "main/include/studyinfo-editable.html"
    template_name = "main/include/studyinfo-readonly.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = edd_forms.ModifyStudyForm(
            data=request.POST or None,
            instance=study,
            prefix="study",
        )
        if form.is_valid():
            form.save()
            return self.update_or_redirect()
        else:
            return self.error_or_redirect(
                {"edit_study": form, "study": study},
                _("Could not update Study information."),
            )


class ModifyPermissionView(StudyOverviewPartial):
    """Handles updates to Study permissions."""

    partial_error_template = "main/include/studyperm-editable.html"
    template_name = "main/include/studyperm-readonly.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = edd_forms.PermissionForm(
            data=request.POST or None,
            study=study,
        )
        if form.is_valid():
            return self.update_or_redirect()
        else:
            return self.error_or_redirect(
                {"permission_form": form, "study": study},
                _("Could not update permissions."),
            )


class DeleteStudyView(StudyObjectMixin, generic.DetailView):
    template_name = "main/confirm_delete.html"

    def get_context_data(self, form, **kwargs):
        context = super().get_context_data(**kwargs)
        study = self.get_object()
        count = form.selection.measurements.count() if form.is_valid() else 0
        context.update(
            cancel_link=reverse("main:overview", kwargs={"slug": study.slug}),
            form=form,
            item_names=[study.name],
            item_count=1,
            measurement_count=count,
        )
        return context

    def get(self, request, *args, **kwargs):
        self.check_write_permission(request)
        form = self._build_form(request)
        return self._show_delete_page(form)

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        form = self._build_form(request)
        confirm = request.POST.get("confirm", None) == "true"
        if not form.is_valid():
            messages.error(
                request,
                _("There was a problem validating the Study to delete."),
            )
            self._show_delete_page(form, status=codes.bad_request)
        elif confirm:
            return self._delete_study(request, form)
        return self._show_delete_page(form)

    def _build_form(self, request):
        study = self.get_object()
        # hard-code to the URL study parameter, don't accept any other POST data
        return export_forms.ExportSelectionForm(
            data={"studyId": [study.pk]},
            exclude_disabled=False,
            user=request.user,
        )

    def _delete_study(self, request, form):
        try:
            study = self.get_object()
            lvs = redis.LatestViewedStudies(request.user)
            lvs.remove_study(study)
            with transaction.atomic():
                if form.selection.measurements.count() == 0:
                    study.delete()
                else:
                    study.active = False
                    study.save(update_fields=["active"])
            messages.success(
                request,
                _("Deleted Study {name}").format(name=study.name),
            )
            return HttpResponseRedirect(reverse("main:index"))
        except Exception as e:
            logger.error("Failed deleting study", exc_info=e)
            messages.error(
                request,
                _("There was a problem completing the Study deletion."),
            )
            return self._show_delete_page(form, status=codes.server_error)

    def _show_delete_page(self, form, status=codes.ok):
        return self.render_to_response(
            self.get_context_data(form=form),
            status=status,
        )


class RestoreStudyView(StudyObjectMixin, generic.edit.UpdateView):
    fields = []
    template_name = "main/restore_study.html"

    def get_queryset(self):
        qs = super().get_queryset()
        # parent explicitly only finds active Study records
        return qs.filter(active=False).distinct()

    def get(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return self.render_to_response(self.get_context_data())

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return self._restore_study(request)

    def _restore_study(self, request):
        try:
            study = self.get_object(queryset=self.get_queryset())
            study.active = True
            study.save(update_fields=["active"])
            messages.success(
                request,
                _("Restored Study {name}").format(name=study.name),
            )
            url = reverse("main:overview", kwargs={"slug": study.slug})
            return HttpResponseRedirect(url)
        except Exception as e:
            logger.error("Failed restoring study", exc_info=e)
            messages.error(
                request,
                _("There was a problem restoring the Study."),
            )
            return self.render_to_response(
                self.get_context_data(),
                status=codes.server_error,
            )


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
                request.POST, instance=assay, prefix="assay", study=study
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
            request.POST,
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
                    form_payload,
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
