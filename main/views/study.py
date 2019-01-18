# coding: utf-8
"""
Views dealing with displaying and manipulating Study records.
"""

import collections
import logging

from django.conf import settings
from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils.translation import ugettext as _
from django.views import generic
from requests import codes
from rest_framework.reverse import reverse as rest_reverse

from .export import ExportView, SbmlView, WorklistView
from .. import forms as edd_forms, models as edd_models, redis
from ..export import forms as export_forms
from ..export.table import ExportSelection


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


class StudyObjectMixin(generic.detail.SingleObjectMixin):
    """Mixin class to add to Study views."""

    model = edd_models.Study

    def get_object(self, queryset=None):
        """ Overrides the base method to curry if there is no filtering queryset. """
        # already looked up object and no filter needed, return previous object
        if hasattr(self, "_detail_object") and queryset is None:
            return self._detail_object
        # call parents
        obj = super().get_object(queryset)
        # save parents result if no filtering queryset
        if queryset is None:
            self._detail_object = obj
        return obj

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_superuser:
            return qs
        return qs.filter(edd_models.Study.access_filter(self.request.user)).distinct()

    def check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(
                _("You do not have permission to modify this Study.")
            )


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


class StudyDetailBaseView(StudyObjectMixin, generic.DetailView):
    """ Study details page, displays line/assay data. """

    template_name = "main/study-overview.html"

    def get_actions(self):
        """
        Return a dict mapping action names to functions performing the action. These functions
        may return one of the following values:
            1. True: indicates a change was made; redirects to a GET request
            2. False: indicates no change was made; no redirect
            3. HttpResponse instance: the explicit response to return
            4. view function: another view to handle the request
        """
        action_lookup = collections.defaultdict(lambda: self.handle_unknown)
        action_lookup.update(
            delete_confirm=self.handle_delete_confirm,
            showImportPrototype="edd_file_importer" in settings.INSTALLED_APPS,
            study_delete=self.handle_delete,
            study_restore=self.handle_restore,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        instance = self.get_object()
        lvs = redis.LatestViewedStudies(self.request.user)
        lvs.viewed_study(instance)
        context.update(
            assays=edd_models.Assay.objects.filter(
                line__study=instance, active=True
            ).exists(),
            lines=instance.line_set.filter(active=True).exists(),
            rest=rest_reverse(
                "rest:studies-detail", kwargs={"pk": instance.pk}, request=self.request
            ),
            writable=instance.user_can_write(self.request.user),
        )
        return context

    def handle_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        return StudyDeleteView.as_view()

    def handle_delete_confirm(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        instance = self.get_object()
        # re-using export selection to check if Study has data or not
        selection = ExportSelection(request.user, studyId=[instance.pk])
        lvs = redis.LatestViewedStudies(self.request.user)
        lvs.remove_study(instance)
        if selection.measurements.count() == 0:
            # true deletion only if there are zero measurements!
            instance.delete()
        else:
            instance.active = False
            instance.save(update_fields=["active"])
        messages.success(
            request, _('Deleted Study "{study}".').format(study=instance.name)
        )
        return HttpResponseRedirect(reverse("main:index"))

    def handle_restore(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        instance = self.get_object()
        instance.active = True
        instance.save(update_fields=["active"])
        messages.success(
            request, _('Restored Study "{study}".').format(study=instance.name)
        )
        return True

    def handle_unknown(self, request, context, *args, **kwargs):
        """ Default fallback action handler, displays an error message. """
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


class StudyAttachmentView(generic.DetailView):
    model = edd_models.Attachment
    pk_url_kwarg = "file_id"
    slug_url_kwarg = None
    template_name = "main/confirm_delete.html"

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

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        attachment = self.get_object()
        study = self._get_studyview().get_object()
        context.update(
            cancel_link=reverse("main:overview", kwargs={"slug": study.slug}),
            confirm_action="delete",
            delete_select=None,
            item_names=[attachment.filename],
            measurement_count=0,
            typename=_("Attachment"),
        )
        return context

    def get_queryset(self):
        # get the default Attachment queryset
        qs = super().get_queryset()
        # use the _studyview to find the Study referenced in the URL
        study = self._get_studyview().get_object()
        # filter on only Attachments on the Study from the URL
        return qs.filter(object_ref=study)

    def get(self, request, *args, **kwargs):
        model = self.object = self.get_object()
        response = HttpResponse(model.file.read(), content_type=model.mime_type)
        response["Content-Disposition"] = f'attachment; filename="{model.filename}"'
        return response

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        action = request.POST.get("action", None)
        studyview = self._get_studyview()
        studyview.check_write_permission(request)
        study = studyview.get_object()
        if "delete" == action:
            name = instance.filename
            instance.delete()
            messages.success(request, _("Deleted attachment {name}.").format(name=name))
            return HttpResponseRedirect(
                reverse("main:overview", kwargs={"slug": study.slug})
            )
        return self.render_to_response(self.get_context_data(**kwargs))


class StudyOverviewView(StudyDetailBaseView):
    """
    Study overview page, displays study name, description, comments, attachments, permissions.
    """

    template_name = "main/study-overview.html"

    def get_actions(self):
        action_lookup = super().get_actions()
        action_lookup.update(
            attach=self.handle_attach,
            comment=self.handle_comment,
            update=self.handle_update,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(
            showingoverview=True,
            edit_study=edd_forms.CreateStudyForm(
                instance=self.get_object(), prefix="study"
            ),
            new_attach=edd_forms.CreateAttachmentForm(),
            new_comment=edd_forms.CreateCommentForm(),
            permission_none=edd_models.StudyPermission.NONE,
            permission_read=edd_models.StudyPermission.READ,
            permission_write=edd_models.StudyPermission.WRITE,
        )
        return context

    def handle_attach(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        form = edd_forms.CreateAttachmentForm(
            request.POST, request.FILES, edd_object=self.get_object()
        )
        if form.is_valid():
            form.save()
            return True
        context["new_attach"] = form
        return False

    def handle_comment(self, request, context, *args, **kwargs):
        form = edd_forms.CreateCommentForm(request.POST, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        context["new_comment"] = form
        return False

    def handle_update(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        form = edd_forms.CreateStudyForm(
            request.POST or None, instance=self.object, prefix="study"
        )
        if form.is_valid():
            # save should update the cached value of object
            self.object = form.save()
            return True
        context["edit_study"] = form
        return False


class StudyLinesView(StudyDetailBaseView):
    """ Study details displays line data. """

    template_name = "main/study-lines.html"

    def get_actions(self):
        action_lookup = super().get_actions()
        action_lookup.update(
            assay=self.handle_assay,
            clone=self.handle_clone,
            disable=self.handle_delete_line,
            disable_confirm=self.handle_disable,
            enable=self.handle_enable,
            export=self.handle_line_export,
            line=self.handle_line,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        study = self.get_object()
        context.update(
            new_assay=edd_forms.AssayForm(prefix="assay", study=study),
            new_line=edd_forms.LineForm(prefix="line", study=study),
            showinglines=True,
            writable=self.get_object().user_can_write(self.request.user),
        )
        return context

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
        """ Sends to a view to confirm deletion. """
        self.check_write_permission(request)
        return StudyDeleteView.as_view()

    def handle_disable(self, request, context, *args, **kwargs):
        return self.handle_enable_disable(request, False, **kwargs)

    def handle_enable_disable(self, request, active, **kwargs):
        self.check_write_permission(request)
        form = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user, exclude_disabled=False
        )
        if form.is_valid():
            with transaction.atomic():
                if not active and form.selection.measurements.count() == 0:
                    # true deletion only if there are zero measurements!
                    count, details = form.selection.lines.delete()
                    count = details[edd_models.Line._meta.label]
                else:
                    count = form.selection.lines.update(active=active)
                    # cascade deactivation to assays and measurements
                    # NOTE: ExportSelectionForm already filters out deactivated elements,
                    #   so this will _NOT_ re-activate objects from previously
                    #   deactivated lines.
                    form.selection.assays.update(active=active)
                    form.selection.measurements.update(active=active)

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
        elif "lineId" in selectForm.cleaned_data:  # no selection == new line
            return self.handle_line_new(request, context)
        messages.error(request, _("Failed to load line for editing."))
        return False

    def handle_line_export(self, request, context, *args, **kwargs):
        export_type = request.POST.get("export", "csv")
        return self._get_export_types().get(export_type, ExportView.as_view())

    def handle_line_edit(self, request, context, lines):
        study = self.get_object()
        total = lines.count()
        saved = 0
        for line in lines:
            form = edd_forms.LineForm(
                request.POST, instance=line, prefix="line", study=study
            )
            form.check_bulk_edit()  # removes fields having disabled bulk edit checkbox
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
            messages.success(
                request, _("Added Line '{name}'").format(name=form["name"].value())
            )
            return True
        context.update(new_line=form)
        return False

    def _get_export_types(self):
        return {
            "csv": ExportView.as_view(),
            "sbml": SbmlView.as_view(),
            "study": StudyCreateView.as_view(),
            "worklist": WorklistView.as_view(),
        }


class StudyDetailView(StudyDetailBaseView):
    """ Study details page, displays graph/assay data. """

    template_name = "main/study-data.html"

    def get_actions(self):
        action_lookup = super().get_actions()
        action_lookup.update(
            assay=self.handle_assay_edit,
            disable_assay=self.handle_assay_delete,
            disable_assay_confirm=self.handle_assay_confirm_delete,
            export=self.handle_export,
            measurement=self.handle_measurement_add,
            measurement_edit=self.handle_measurement_edit,
            measurement_update=self.handle_measurement_edit,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        study = self.get_object()
        context.update(
            new_assay=edd_forms.AssayForm(prefix="assay", study=study),
            new_measurement=edd_forms.MeasurementForm(prefix="measurement"),
            showingdata=True,
            writable=self.get_object().user_can_write(self.request.user),
        )
        return context

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
        return StudyDeleteView.as_view()

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
            form.check_bulk_edit()  # removes fields having disabled bulk edit checkbox
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

    def handle_export(self, request, context, *args, **kwargs):
        return ExportView.as_view()

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


class StudyDeleteView(StudyLinesView):
    """ Confirmation view for deleting objects from a Study. """

    template_name = "main/confirm_delete.html"

    def get_actions(self):
        """ Return a dict mapping action names to functions performing the action. """
        action_lookup = collections.defaultdict(lambda: self.handle_unknown)
        action_lookup.update(
            disable=self.handle_line_delete,
            disable_assay=self.handle_assay_measurement_delete,
            study_delete=self.handle_study_delete,
        )
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        request = kwargs.get("request")
        form = export_forms.ExportSelectionForm(
            data=request.POST, user=request.user, exclude_disabled=False
        )
        if form.is_valid():
            count = form.selection.measurements.count()
        else:
            count = 0
        context.update(
            cancel_link=request.path, delete_select=form, measurement_count=count
        )
        return context

    def handle_assay_measurement_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        form = context["delete_select"]
        study = self.get_object()
        if form.is_valid():
            # valid form means at least the IDs match correct things
            # filter out selected items to do permission checks
            if "assayId" in form.cleaned_data:
                # if passed in assay IDs, report on assays and ignore measurements
                qs = form.cleaned_data["assayId"].filter(study_id=study.pk)
                context.update(
                    confirm_action="disable_assay_confirm",
                    item_count=qs.count(),
                    item_names=qs[:10].values_list("name", flat=True),
                    typename=_("Assay"),
                )
            # TODO: uncovered
            elif "measurementId" in form.cleaned_data:
                # if passed in measurement IDs, report on measurements
                qs = form.cleaned_data["measurementId"].filter(study_id=study.pk)
                context.update(
                    confirm_action="disable_assay_confirm",
                    item_count=qs.count(),
                    item_names=qs[:10].values_list("name", flat=True),
                    typename=_("Measurement"),
                )
            else:
                # anything else is an error
                return False
            # END uncovered
            return self.render_to_response(context)
        # TODO: uncovered
        return False
        # END uncovered

    def handle_line_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        # use only Line IDs from export_forms.ExportSelectionForm; ignore everything else
        form = context["delete_select"]
        study = self.get_object()
        if form.is_valid():
            if "lineId" in form.cleaned_data:
                # limit to items in this study, which is known to have write permission
                qs = form.cleaned_data["lineId"].filter(study_id=study.pk)
                context.update(
                    confirm_action="disable_confirm",
                    item_count=qs.count(),
                    item_names=qs[:10].values_list("name", flat=True),
                    typename=_("Line"),
                )
                return self.render_to_response(context)
        # TODO: uncovered
        return False
        # END uncovered

    def handle_study_delete(self, request, context, *args, **kwargs):
        self.check_write_permission(request)
        # don't use anything from export_forms.ExportSelectionForm, just get study from URL
        context.update(
            confirm_action="delete_confirm",
            item_count=1,
            item_names=[self.get_object().name],
            typename=_("Study"),
        )
        return self.render_to_response(context)
