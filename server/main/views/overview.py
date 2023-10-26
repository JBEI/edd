"""Views for individual Study Overview actions."""

import logging
from http import HTTPStatus

from django.contrib import messages
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import get_template
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views import generic

from edd.export.forms import ExportSelectionForm

from .. import forms, models, redis
from .mixins import StudyObjectMixin

logger = logging.getLogger(__name__)


class StudyOverviewView(StudyObjectMixin, generic.DetailView):
    """
    Study overview page; displays basic info on a Study--name, description, and
    contact; with comments, attachments, permissions.
    """

    template_name = "main/study-overview.html"

    def get_context_data(self, **kwargs):
        study = self.get_object()
        return super().get_context_data(
            can_make_public=models.EveryonePermission.can_make_public(
                self.request.user,
            ),
            edit_study=forms.ModifyStudyForm(instance=study, prefix="study"),
            new_attach=forms.CreateAttachmentForm(),
            new_comment=forms.CreateCommentForm(),
            permission_form=forms.PermissionForm(study=study),
            permission_none=models.StudyPermission.NONE,
            permission_read=models.StudyPermission.READ,
            permission_write=models.StudyPermission.WRITE,
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

    partial_error_template = None

    def get(self, request, *args, **kwargs):
        return self._redirect()

    def error_or_redirect(self, context, message=None):
        if self.isAjax():
            template = get_template(self.partial_error_template)
            return HttpResponse(
                template.render(context),
                status=HTTPStatus.BAD_REQUEST,
            )
        elif message:
            messages.error(self.request, message)
        return self._redirect()

    def isAjax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"

    def update_or_redirect(self):
        if self.isAjax():
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
        form = forms.CreateAttachmentForm(
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


class StudyAttachmentView(generic.DetailView):
    model = models.Attachment
    pk_url_kwarg = "file_id"
    slug_url_kwarg = None

    def _get_studyview(self):
        # keep a StudyOverviewView instance to re-use the code there to find a Study
        if hasattr(self, "_studyview"):
            return self._studyview
        self._studyview = StudyOverviewView()
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


class CreateCommentView(StudyOverviewPartial):
    """Handles adding comments to a Study."""

    partial_error_template = "main/include/add-comment.html"
    template_name = "main/include/comments.html"

    def post(self, request, *args, **kwargs):
        self.check_write_permission(request)
        study = self.get_object()
        form = forms.CreateCommentForm(
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
        form = forms.ModifyStudyForm(
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
        form = forms.PermissionForm(
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
    """Confirmation page and deletion for Study records."""

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
            self._show_delete_page(form, status=HTTPStatus.BAD_REQUEST)
        elif confirm:
            return self._delete_study(request, form)
        return self._show_delete_page(form)

    def _build_form(self, request):
        study = self.get_object()
        # hard-code to the URL study parameter, don't accept any other POST data
        return ExportSelectionForm(
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
            return self._show_delete_page(form, status=HTTPStatus.SERVER_ERROR)

    def _show_delete_page(self, form, status=HTTPStatus.OK):
        return self.render_to_response(
            self.get_context_data(form=form),
            status=status,
        )


class RestoreStudyView(StudyObjectMixin, generic.edit.UpdateView):
    """Confirmation page and restore for archived/deleted Study records."""

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
                status=HTTPStatus.SERVER_ERROR,
            )
