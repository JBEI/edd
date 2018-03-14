# coding: utf-8

import collections
import json
import logging
import re

from django.conf import settings
from django.contrib import messages
from django.contrib.postgres.aggregates import ArrayAgg
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.urlresolvers import reverse
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import Http404, HttpResponse, HttpResponseRedirect, JsonResponse, QueryDict
from django.shortcuts import render, get_object_or_404
from django.template.defaulttags import register
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext as _
from django.views import generic
from django.views.decorators.csrf import ensure_csrf_cookie
from future.utils import viewvalues
from messages_extends import constants as msg_constants
from requests import codes
from rest_framework.exceptions import MethodNotAllowed

from main.importer.experiment_desc.constants import (
    ALLOW_DUPLICATE_NAMES_PARAM,
    ALLOW_NON_STRAIN_PARTS,
    BAD_FILE_CATEGORY,
    DRY_RUN_PARAM,
    IGNORE_ICE_ACCESS_ERRORS_PARAM,
    INTERNAL_EDD_ERROR_CATEGORY,
    INTERNAL_SERVER_ERROR,
    OMIT_STRAINS,
    UNPREDICTED_ERROR,
    UNSUPPORTED_FILE_TYPE,
)
from main.importer.experiment_desc.importer import (
    _build_response_content,
    ExperimentDescriptionOptions,
    ImportErrorSummary,
)
from . import autocomplete, models as edd_models, redis
from .export.forms import ExportOptionForm, ExportSelectionForm, WorklistForm
from .export.sbml import SbmlExport
from .export.table import ExportSelection, TableExport, WorklistExport
from .forms import (
    AssayForm,
    CreateAttachmentForm,
    CreateCommentForm,
    CreateStudyForm,
    LineForm,
    MeasurementForm,
    MeasurementValueFormSet,
)
from .importer.experiment_desc import CombinatorialCreationImporter
from .importer import parser
from .models import (
    Assay,
    Line,
    Measurement,
    MeasurementType,
    MeasurementValue,
    Metabolite,
    MetaboliteSpecies,
    Protocol,
    SBMLTemplate,
    Study,
    StudyPermission,
    Update,
)
from .models.common import qfilter
from .solr import StudySearch
from .tasks import import_table_task
from .utilities import (
    get_edddata_misc,
    get_edddata_study,
)
from edd import utilities


logger = logging.getLogger(__name__)

EXCEL_TYPES = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]


@register.filter(name='lookup')
def lookup(dictionary, key):
    """
    Utility template filter, as Django forbids argument passing in templates. Used for filtering
    out values, e.g. for metadata, of list has EDDObject items and type is a MetadataType:
    {%% for obj in list %%}
    {{ obj.metadata|lookup:type }}
    {%% endfor %%}
    """
    return dictionary.get(key, settings.TEMPLATE_STRING_IF_INVALID)


@register.filter(name='formula')
def formula(molecular_formula):
    """ Convert the molecular formula to a list of dictionaries giving each element and its count.
        This is used in HTML views with <sub> tags. """
    elements = re.findall("([A-Z][a-z]{0,2})([1-9][0-9]*)?", molecular_formula)
    return mark_safe(
        "".join(['%s%s' % (e, '<sub>%s</sub>' % c if c != '' else c) for e, c in elements])
        )


def load_study(request, pk=None, slug=None, permission_type=StudyPermission.CAN_VIEW):
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
        permission = Study.user_permission_q(request.user, permission_type)
    if pk is not None:
        return get_object_or_404(Study.objects.distinct(), permission, Q(pk=pk))
    elif slug is not None:
        return get_object_or_404(Study.objects.distinct(), permission, Q(slug=slug))
    raise Http404()


class StudyCreateView(generic.edit.CreateView):
    """
    View for request to create a Study.
    """
    form_class = CreateStudyForm
    model = Study
    template_name = 'main/create_study.html'

    def form_valid(self, form):
        update = Update.load_request_update(self.request)
        study = form.instance
        study.active = True     # defaults to True, but being explicit
        study.created = update
        study.updated = update
        return generic.edit.CreateView.form_valid(self, form)

    def get_context_data(self, **kwargs):
        context = super(StudyCreateView, self).get_context_data(**kwargs)
        context['can_create'] = Study.user_can_create(self.request.user)
        return context

    def get_form_kwargs(self):
        kwargs = super(StudyCreateView, self).get_form_kwargs()
        kwargs.update(user=self.request.user)
        return kwargs

    def get_success_url(self):
        return reverse('main:overview', kwargs={'slug': self.object.slug})


class StudyObjectMixin(generic.detail.SingleObjectMixin):
    """ Mixin class to add to Study views """
    model = edd_models.Study

    def get_object(self, queryset=None):
        """ Overrides the base method to curry if there is no filtering queryset. """
        # already looked up object and no filter needed, return previous object
        if hasattr(self, '_detail_object') and queryset is None:
            return self._detail_object
        # call parents
        obj = super(StudyObjectMixin, self).get_object(queryset)
        # save parents result if no filtering queryset
        if queryset is None:
            self._detail_object = obj
        return obj

    def get_queryset(self):
        qs = super(StudyObjectMixin, self).get_queryset()
        if self.request.user.is_superuser:
            return qs
        return qs.filter(Study.user_permission_q(self.request.user,
                                                 StudyPermission.CAN_VIEW)).distinct()


class StudyIndexView(generic.edit.CreateView):
    """
    View for the the index page.
    """
    form_class = CreateStudyForm
    model = Study
    template_name = 'main/index.html'

    def get_context_data(self, **kwargs):
        context = super(StudyIndexView, self).get_context_data(**kwargs)
        lvs = redis.LatestViewedStudies(self.request.user)
        # just doing filter will lose the order
        latest_qs = self.get_queryset().filter(pk__in=lvs)
        # so create a dict of string-casted pk to study
        latest_by_pk = {str(s.pk): s for s in latest_qs}
        # and a mapping of lvs to retain order
        latest = map(lambda pk: latest_by_pk.get(pk, None), lvs)
        # filter out the Nones
        context['latest_viewed_studies'] = list(filter(bool, latest))
        context['can_create'] = Study.user_can_create(self.request.user)
        return context

    def form_valid(self, form):
        update = Update.load_request_update(self.request)
        study = form.instance
        study.active = True     # defaults to True, but being explicit
        study.created = update
        study.updated = update
        return super(StudyIndexView, self).form_valid(form)

    def get_form_kwargs(self):
        kwargs = super(StudyIndexView, self).get_form_kwargs()
        kwargs.update(user=self.request.user)
        return kwargs

    def get_success_url(self):
        return reverse('main:overview', kwargs={'slug': self.object.slug})


class StudyDetailBaseView(StudyObjectMixin, generic.DetailView):
    """ Study details page, displays line/assay data. """
    template_name = 'main/study-overview.html'

    def get_actions(self, can_write=False):
        """
        Return a dict mapping action names to functions performing the action. These functions
        may return one of the following values:
            1. True: indicates a change was made; redirects to a GET request
            2. False: indicates no change was made; no redirect
            3. HttpResponse instance: the explicit response to return
            4. view function: another view to handle the request
        """
        action_lookup = collections.defaultdict(lambda: self.handle_unknown)
        if can_write:
            action_lookup.update({
                'delete_confirm': self.handle_delete_confirm,
                'study_delete': self.handle_delete,
                'study_restore': self.handle_restore,
            })
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super(StudyDetailBaseView, self).get_context_data(**kwargs)
        instance = self.get_object()
        lvs = redis.LatestViewedStudies(self.request.user)
        lvs.viewed_study(instance)
        context['writable'] = instance.user_can_write(self.request.user)
        context['lines'] = instance.line_set.filter(active=True).count() > 0
        context['assays'] = Assay.objects.filter(line__study=instance, active=True).count() > 0
        return context

    def handle_clone(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('lineId', [])
        study = self.get_object()
        cloned = 0
        for line_id in ids:
            line = self._get_line(line_id)
            if line:
                # easy way to clone is just pretend to fill out add line form
                initial = LineForm.initial_from_model(line)
                # update name to indicate which is the clone
                initial['name'] = initial['name'] + ' clone'
                clone = LineForm(initial, study=study)
                if clone.is_valid():
                    clone.save()
                    cloned += 1
        messages.success(
            request,
            _('Cloned %(cloned)s of %(total)s Lines') % {
                'cloned': cloned,
                'total': len(ids),
            }
        )
        return True

    def handle_delete(self, request, context, *args, **kwargs):
        self._check_write_permission(request)
        return StudyDeleteView.as_view()

    def handle_delete_confirm(self, request, context, *args, **kwargs):
        self._check_write_permission(request)
        instance = self.get_object()
        form = ExportSelectionForm(data=request.POST, user=request.user)
        lvs = redis.LatestViewedStudies(self.request.user)
        if form.is_valid():
            if form.selection.measurements.count() == 0:
                # true deletion only if there are zero measurements!
                instance.delete()
            else:
                instance.active = False
                instance.save(update_fields=['active'])
            lvs.remove_study(instance)
            messages.success(
                request,
                _('Deleted Study "%(study)s".') % {
                    'study': instance.name,
                }
            )
            return HttpResponseRedirect(reverse('main:index'))
        messages.error(request, _('Failed to validate deletion.'))
        return False

    def handle_restore(self, request, context, *args, **kwargs):
        self._check_write_permission(request)
        instance = self.get_object()
        instance.active = True
        instance.save(update_fields=['active'])
        messages.success(
            request,
            _('Restored Study "%(study)s".') % {
                'study': instance.name,
            }
        )
        return True

    def handle_unknown(self, request, context, *args, **kwargs):
        """ Default fallback action handler, displays an error message. """
        messages.error(
            request,
            _('Unknown action, or you do not have permission to modify this study.'),
        )
        return False

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        action = request.POST.get('action', None)
        context = self.get_context_data(object=instance, action=action, request=request)
        can_write = instance.user_can_write(request.user)
        action_lookup = self.get_actions(can_write=can_write)
        action_fn = action_lookup[action]
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

    def post_response(self, request, context, form_valid):
        if form_valid:
            # redirect to the same location to avoid re-submitting forms with back/forward
            return HttpResponseRedirect(request.path)
        return self.render_to_response(context)

    def _check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(_("You do not have permission to modify this study."))


class StudyAttachmentView(generic.DetailView):
    model = edd_models.Attachment
    pk_url_kwarg = 'file_id'
    slug_url_kwarg = None
    template_name = 'main/confirm_delete.html'

    def _get_studyview(self):
        # keep a StudyDetailView instance to re-use the code there to find a Study
        if hasattr(self, '_studyview'):
            return self._studyview
        self._studyview = StudyDetailView()
        self._studyview.request = self.request
        self._studyview.args = self.args
        self._studyview.kwargs = self.kwargs
        # SingleObjectMixin depends on an object property being set on views
        self._studyview.object = self._studyview.get_object()
        return self._studyview

    def get_context_data(self, **kwargs):
        context = super(StudyAttachmentView, self).get_context_data(**kwargs)
        attachment = self.get_object()
        study = self._get_studyview().get_object()
        context['cancel_link'] = reverse('main:overview', kwargs={'slug': study.slug})
        context['confirm_action'] = 'delete'
        context['delete_select'] = None
        context['item_names'] = [attachment.filename]
        context['measurement_count'] = 0
        context['typename'] = _('Attachment')
        return context

    def get_queryset(self):
        # get the default Attachment queryset
        qs = super(StudyAttachmentView, self).get_queryset()
        # use the _studyview to find the Study referenced in the URL
        study = self._get_studyview().get_object()
        # filter on only Attachments on the Study from the URL
        return qs.filter(object_ref=study)

    def get(self, request, *args, **kwargs):
        model = self.object = self.get_object()
        response = HttpResponse(model.file.read(), content_type=model.mime_type)
        response['Content-Disposition'] = 'attachment; filename="%s"' % model.filename
        return response

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        action = request.POST.get('action', None)
        studyview = self._get_studyview()
        studyview._check_write_permission(request)
        study = studyview.get_object()
        if 'delete' == action:
            name = instance.filename
            instance.delete()
            messages.success(request, _('Deleted attachment %(filename)s.') % {'filename': name})
            return HttpResponseRedirect(reverse('main:overview', kwargs={'slug': study.slug}))
        return self.render_to_response(self.get_context_data(**kwargs))


class StudyUpdateView(StudyObjectMixin, generic.edit.BaseUpdateView):
    """ View used to handle POST to update single Study fields. """
    update_action = None

    def __init__(self, update_action=None, *args, **kwargs):
        super(StudyUpdateView, self).__init__(*args, **kwargs)
        self.update_action = update_action
        self.fields = self._get_fields(update_action)

    def _get_fields(self, update_action):
        # select the field to update based on the update_action
        return [{
            'rename': 'name',
            'setdescription': 'description',
            'setcontact': 'contact',
        }.get(update_action, 'name')]

    def get_form_kwargs(self):
        kwargs = super(StudyUpdateView, self).get_form_kwargs()
        # updated value comes in as 'value'; copy it to field the form expects
        if 'data' in kwargs and 'value' in kwargs['data']:
            data = QueryDict(mutable=True)
            data.update(kwargs['data'])
            data.update({self.fields[0]: data['value']})
            kwargs['data'] = data
        return kwargs

    def form_valid(self, form):
        # save should update the cached value of object
        self.object = form.save()
        return JsonResponse(
            {
                "type": "Success",
                "message": "Study %s updated." % self.fields,
            },
            encoder=utilities.JSONEncoder,
        )

    def form_invalid(self, form):
        return JsonResponse(
            {
                "type": "Failure",
                "message": "Validation failed",
            },
            encoder=utilities.JSONEncoder,
            status=400,
        )


class ExperimentDescriptionHelp(generic.TemplateView):
    template_name = 'main/experiment_description_help.html'


class AddLineCombos(StudyObjectMixin, generic.DetailView):
    template_name = 'main/study-lines-add-combos.html'

    def get(self, request, *args, **kwargs):
        # load study to enforce permissions check... permissions should also be checked by back end
        # during user attempt to create the lines, but better to identify permissions errors before
        # loading the form
        pk = kwargs.get('pk')
        slug = kwargs.get('slug')
        load_study(request, pk=pk, slug=slug, permission_type=StudyPermission.CAN_EDIT)

        # render the template
        return super(AddLineCombos, self).get(request, *args, **kwargs)


class StudyOverviewView(StudyDetailBaseView):
    """
    Study overview page, displays study name, description, comments, attachments, permissions.
    """
    template_name = 'main/study-overview.html'

    def get_actions(self, can_write=False):
        action_lookup = super(StudyOverviewView, self).get_actions(can_write=can_write)
        action_lookup.update({
            'comment': self.handle_comment,
        })
        if can_write:
            action_lookup.update({
                'attach': self.handle_attach,
                'update': self.handle_update,
            })
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super(StudyOverviewView, self).get_context_data(**kwargs)
        context['showingoverview'] = True
        context['edit_study'] = CreateStudyForm(instance=self.get_object(), prefix='study')
        context['new_attach'] = CreateAttachmentForm()
        context['new_comment'] = CreateCommentForm()
        context['permission_none'] = StudyPermission.NONE
        context['permission_read'] = StudyPermission.READ
        context['permission_write'] = StudyPermission.WRITE
        return context

    def handle_attach(self, request, context, *args, **kwargs):
        form = CreateAttachmentForm(request.POST, request.FILES, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        context['new_attach'] = form
        return False

    def handle_comment(self, request, context, *args, **kwargs):
        form = CreateCommentForm(request.POST, edd_object=self.get_object())
        if form.is_valid():
            form.save()
            return True
        context['new_comment'] = form
        return False

    def handle_update(self, request, context, *args, **kwargs):
        study = self.get_object()
        form = CreateStudyForm(request.POST or None, instance=study, prefix='study')
        if form.is_valid():
            # save should update the cached value of object
            self.object = form.save()
            return True
        context['edit_study'] = form
        return False


class StudyLinesView(StudyDetailBaseView):
    """ Study details displays line data. """
    template_name = 'main/study-lines.html'

    def get_actions(self, can_write=False):
        action_lookup = super(StudyLinesView, self).get_actions(can_write=can_write)
        action_lookup.update({
            'assay_action': self.handle_assay_action,
            'line_action': self.handle_line_action,
        })
        if can_write:
            action_lookup.update({
                'assay': self.handle_assay,
                'clone': self.handle_clone,
                'enable': self.handle_enable,
                'disable': self.handle_delete_line,
                'disable_confirm': self.handle_disable,
                'line': self.handle_line,
                'measurement': self.handle_measurement,
            })
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super(StudyLinesView, self).get_context_data(**kwargs)
        context['showinglines'] = True
        context['new_assay'] = AssayForm(prefix='assay')
        context['new_line'] = LineForm(prefix='line')
        context['new_measurement'] = MeasurementForm(prefix='measurement')
        context['writable'] = self.get_object().user_can_write(self.request.user)
        return context

    def handle_assay(self, request, context, *args, **kwargs):
        assay_id = request.POST.get('assay-assay_id', None)
        assay = self._get_assay(assay_id) if assay_id else None
        if assay:
            form = AssayForm(request.POST, instance=assay, lines=[assay.line_id], prefix='assay')
        else:
            ids = request.POST.getlist('lineId', [])
            form = AssayForm(request.POST, lines=ids, prefix='assay')
            if len(ids) == 0:
                form.add_error(
                    None,
                    ValidationError(
                        _('Must select at least one line to add Assay'),
                        code='no-lines-selected',
                    ),
                )
        if form.is_valid():
            form.save()
            return True
        context['new_assay'] = form
        return False

    def handle_assay_action(self, request, context, *args, **kwargs):
        assay_action = request.POST.get('assay_action', None)
        can_write = self.get_object().user_can_write(request.user)
        form_valid = False
        # allow any who can view to export
        if assay_action == 'export':
            export_type = request.POST.get('export', 'csv')
            if export_type == 'sbml':
                return SbmlView.as_view()
            else:
                return ExportView.as_view()
        # but not edit
        elif not can_write:
            messages.error(request, 'You do not have permission to modify this study.')
        elif assay_action == 'mark':
            form_valid = self.handle_assay_mark(request)
        elif assay_action == 'delete':
            form_valid = self.handle_measurement_delete(request)
        elif assay_action == 'edit':
            form_valid = self.handle_measurement_edit(request)
        elif assay_action == 'update':
            form_valid = self.handle_measurement_update(request, context)
        else:
            messages.error(request, 'Unknown assay action %s' % (assay_action))
        return form_valid

    def handle_measurement(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('assayId', [])
        form = MeasurementForm(request.POST, assays=ids, prefix='measurement')
        if len(ids) == 0:
            form.add_error(
                None,
                ValidationError(
                    _('Must select at least one assay to add Measurement'),
                    code='no-assays-selected'
                ),
            )
        if form.is_valid():
            form.save()
            return True
        context['new_measurement'] = form
        return False

    def handle_enable(self, request, context, *args, **kwargs):
        return self.handle_enable_disable(request, True, **kwargs)

    def handle_delete_line(self, request, context, *args, **kwargs):
        """ Sends to a view to confirm deletion. """
        self._check_write_permission(request)
        return StudyDeleteView.as_view()

    def handle_disable(self, request, context, *args, **kwargs):
        return self.handle_enable_disable(request, False, **kwargs)

    def handle_enable_disable(self, request, active, **kwargs):
        self._check_write_permission(request)
        form = ExportSelectionForm(data=request.POST, user=request.user, exclude_disabled=False)
        if form.is_valid():
            if not active and form.selection.measurements.count() == 0:
                # true deletion only if there are zero measurements!
                count, details = form.selection.lines.delete()
                count = details[Line._meta.label]
            else:
                count = form.selection.lines.update(active=active)
                # cascade deactivation to assays and measurements
                # NOTE: ExportSelectionForm already filters out deactivated elements, so this will
                #   _NOT_ re-activate objects from previously deactivated lines.
                form.selection.assays.update(active=active)
                form.selection.measurements.update(active=active)

            messages.success(
                request,
                _('%(action)s %(count)d Lines') % {
                    'action': 'Restored' if active else 'Deleted',
                    'count': count,
                }
            )
            return True
        messages.error(request, _('Failed to validate selection.'))
        # forms involved here are built dynamically by Typescript, should redirect instead of
        #   trying to use normal form errors
        return HttpResponseRedirect(request.path)

    def handle_line(self, request, context, *args, **kwargs):
        self._check_write_permission(request)
        ids = [v for v in request.POST.get('line-ids', '').split(',') if v.strip() != '']
        if len(ids) == 0:
            return self.handle_line_new(request, context)
        elif len(ids) == 1:
            return self.handle_line_edit(request, context, ids[0])
        return self.handle_line_bulk(request, ids)

    def handle_line_action(self, request, context, *args, **kwargs):
        can_write = self.get_object().user_can_write(request.user)
        line_action = request.POST.get('line_action', None)
        # allow any who can view to export
        if line_action == 'export':
            export_type = request.POST.get('export', 'csv')
            return self._get_export_types().get(export_type, ExportView.as_view())
        # but not edit
        elif not can_write:
            messages.error(request, _('You do not have permission to modify this study.'))
        else:
            messages.error(request, _('Unknown line action %s') % line_action)
        # forms involved here are built dynamically by Typescript, should redirect instead of
        #   trying to use normal form errors
        return HttpResponseRedirect(request.path)

    def handle_line_bulk(self, request, ids):
        study = self.get_object()
        total = len(ids)
        saved = 0
        for value in ids:
            line = self._get_line(value)
            if line:
                form = LineForm(request.POST, instance=line, prefix='line', study=study)
                form.check_bulk_edit()  # removes fields having disabled bulk edit checkbox
                if form.is_valid():
                    form.save()
                    saved += 1
                else:
                    for error in viewvalues(form.errors):
                        messages.warning(request, error)
        messages.success(
            request,
            _('Saved %(saved)s of %(total)s Lines') % {
                'saved': saved,
                'total': total,
            }
        )
        return True

    def handle_line_edit(self, request, context, pk):
        study = self.get_object()
        line = self._get_line(pk)
        if line:
            form = LineForm(request.POST, instance=line, prefix='line', study=study)
            context['new_line'] = form
            if form.is_valid():
                form.save()
                messages.success(
                    request,
                    _("Saved Line '%(name)s'") % {
                        'name': form['name'].value(),
                    }
                )
                return True
        else:
            messages.error(request, _('Failed to load line for editing.'))
        return False

    def handle_line_new(self, request, context):
        form = LineForm(request.POST, prefix='line', study=self.get_object())
        if form.is_valid():
            form.save()
            messages.success(
                request,
                _("Added Line '%(name)s'") % {
                    'name': form['name'].value(),
                }
            )
            return True
        context['new_line'] = form
        return False

    def _get_export_types(self):
        return {
            'csv': ExportView.as_view(),
            'sbml': SbmlView.as_view(),
            'study': StudyCreateView.as_view(),
            'worklist': WorklistView.as_view(),
        }

    def _get_line(self, line_id):
        study = self.get_object()
        try:
            return Line.objects.get(pk=line_id, study=study)
        except Line.DoesNotExist:
            logger.warning('Failed to load (line, study) combo (%s,%s)' % (line_id, study.pk))
        return None


class StudyDetailView(StudyDetailBaseView):
    """ Study details page, displays graph/assay data. """
    template_name = 'main/study-data.html'

    def get_actions(self, can_write=False):
        action_lookup = super(StudyDetailView, self).get_actions(can_write=can_write)
        action_lookup.update({
            'assay_action': self.handle_assay_action,
            'assay_confirm_delete': self.handle_assay_confirm_delete,
        })
        if can_write:
            action_lookup.update({
                'assay': self.handle_assay,
                'clone': self.handle_clone,
                'measurement': self.handle_measurement,
            })
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super(StudyDetailView, self).get_context_data(**kwargs)
        context['showingdata'] = True
        context['new_assay'] = AssayForm(prefix='assay')
        context['new_measurement'] = MeasurementForm(prefix='measurement')
        context['writable'] = self.get_object().user_can_write(self.request.user)
        return context

    def handle_assay(self, request, context, *args, **kwargs):
        assay_id = request.POST.get('assay-assay_id', None)
        assay = self._get_assay(assay_id) if assay_id else None
        if assay:
            form = AssayForm(request.POST, instance=assay, lines=[assay.line_id], prefix='assay')
        else:
            ids = request.POST.getlist('lineId', [])
            form = AssayForm(request.POST, lines=ids, prefix='assay')
            if len(ids) == 0:
                form.add_error(None, ValidationError(
                    _('Must select at least one line to add Assay'),
                    code='no-lines-selected'
                    ))
        if form.is_valid():
            form.save()
            return True
        context['new_assay'] = form
        return False

    def handle_assay_action(self, request, context, *args, **kwargs):
        assay_action = request.POST.get('assay_action', None)
        can_write = self.get_object().user_can_write(request.user)
        form_valid = False
        # allow any who can view to export
        if assay_action == 'export':
            export_type = request.POST.get('export', 'csv')
            if export_type == 'sbml':
                return SbmlView.as_view()
            else:
                return ExportView.as_view()
        # but not edit
        elif not can_write:
            messages.error(request, 'You do not have permission to modify this study.')
        elif assay_action == 'delete':
            form_valid = self.handle_measurement_delete(request)
        elif assay_action == 'edit':
            form_valid = self.handle_measurement_edit(request)
        elif assay_action == 'update':
            form_valid = self.handle_measurement_update(request, context)
        else:
            messages.error(
                request,
                _('Unknown assay action %(action)s') % {
                    'action': assay_action
                }
            )
        return form_valid

    def handle_assay_confirm_delete(self, request, context, *args, **kwargs):
        self._check_write_permission(request)
        form = ExportSelectionForm(data=request.POST, user=request.user, exclude_disabled=False)
        if form.is_valid():
            formdata = form.clean()
            assay_ids = formdata.get('assayId', [])
            if assay_ids:
                # cannot directly use form.selection.assays because it will include parent assay
                #   for any selected measurements, which will not be intended delete behavior
                selection = ExportSelection(
                    request.user,
                    exclude_disabled=False,
                    assayId=assay_ids,
                )
                assay_count = selection.assays.update(active=False)
            else:
                assay_count = 0
            # can directly use form.selection for measurements, and will include measurements
            #   under any selected assays automatically
            measurement_count = form.selection.measurements.update(active=False)
            messages.success(
                request,
                _('Deleted %(assay)d Assays and %(measurement)d Measurements.') % {
                    'assay': assay_count,
                    'measurement': measurement_count,
                }
            )
            return True
        messages.error(request, _('Failed to validate selection.'))
        # forms involved here are built dynamically by Typescript, should redirect instead of
        #   trying to use normal form errors
        return HttpResponseRedirect(request.path)

    def handle_measurement(self, request, context, *args, **kwargs):
        ids = request.POST.getlist('assayId', [])
        form = MeasurementForm(request.POST, assays=ids, prefix='measurement')
        if len(ids) == 0:
            form.add_error(
                None,
                ValidationError(
                    _('Must select at least one assay to add Measurement'),
                    code='no-assays-selected',
                )
            )
        if form.is_valid():
            form.save()
            return True
        context['new_measurement'] = form
        return False

    def handle_measurement_delete(self, request):
        self._check_write_permission(request)
        return StudyDeleteView.as_view()

    def handle_measurement_edit(self, request):
        assay_ids = request.POST.getlist('assayId', [])
        measure_ids = request.POST.getlist('measurementId', [])
        measures = Measurement.objects.filter(
            Q(assay_id__in=assay_ids) | Q(id__in=measure_ids),
        ).select_related(
            'assay__line', 'assay__protocol', 'measurement_type',
        ).order_by(
            'assay__line_id', 'assay_id',
        ).prefetch_related(
            Prefetch('measurementvalue_set', queryset=MeasurementValue.objects.order_by('x'))
        )
        # map sequence of measurements to structure of unique lines/assays
        lines = {}
        for m in measures:
            a = m.assay
            line_dict = lines.setdefault(a.line.id, {'line': a.line, 'assays': {}, })
            assay_dict = line_dict['assays'].setdefault(a.id, {
                'assay': a,
                'measures': collections.OrderedDict(),
            })
            assay_dict['measures'][m.id] = {
                'measure': m,
                'form': MeasurementValueFormSet(
                    instance=m,
                    prefix=str(m.id),
                    queryset=m.measurementvalue_set.order_by('x')
                ),
            }
        return self.handle_measurement_edit_response(request, lines, measures)

    def handle_measurement_edit_response(self, request, lines, measures):
        return render(
            request,
            'main/edit_measurement.html',
            context={
                'lines': lines,
                'measures': ','.join(['%s' % m.pk for m in measures]),
                'study': self.get_object(),
            },
        )

    def handle_measurement_update(self, request, context):
        measure_ids = request.POST.get('measureId', '')
        measures = Measurement.objects.filter(
            id__in=measure_ids.split(',')
        ).select_related(
            'assay__line', 'assay__protocol', 'measurement_type',
        ).order_by(
            'assay__line_id', 'assay_id',
        ).prefetch_related(
            Prefetch('measurementvalue_set', queryset=MeasurementValue.objects.order_by('x'))
        )
        is_valid = True
        # map sequence of measurements to structure of unique lines/assays
        lines = {}
        for m in measures:
            a = m.assay
            line_dict = lines.setdefault(a.line.id, {'line': a.line, 'assays': {}, })
            assay_dict = line_dict['assays'].setdefault(
                a.id,
                {
                    'assay': a,
                    'measures': collections.OrderedDict(),
                }
            )
            aform = MeasurementValueFormSet(
                request.POST or None,
                instance=m,
                prefix=str(m.id),
                queryset=m.measurementvalue_set.order_by('x'),
            )
            if aform.is_valid():
                aform.save()
            else:
                is_valid = False
            assay_dict['measures'][m.id] = {
                'measure': m,
                'form': aform,
            }
        if not is_valid:
            return self.handle_measurement_edit_response(request, lines, measures)
        return True

    def get(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        # redirect to overview page if there are no lines or assays
        if instance.line_set.count() == 0:
            return HttpResponseRedirect(
                reverse('main:overview', kwargs={'slug': instance.slug})
            )
        # redirect to lines page if there are no assays
        if Assay.objects.filter(line__study=instance).count() == 0:
            return HttpResponseRedirect(
                reverse('main:lines', kwargs={'slug': instance.slug})
            )
        return super(StudyDetailView, self).get(request, *args, **kwargs)

    def _get_assay(self, assay_id):
        study = self.get_object()
        try:
            return Assay.objects.get(pk=assay_id, line__study=study)
        except Assay.DoesNotExist:
            logger.warning('Failed to load assay,study combo %s,%s' % (assay_id, study.pk))
        return None


class StudyDeleteView(StudyLinesView):
    """ Confirmation view for deleting objects from a Study. """
    template_name = 'main/confirm_delete.html'

    def get_actions(self, can_write=False):
        """ Return a dict mapping action names to functions performing the action. """
        action_lookup = collections.defaultdict(lambda: self.handle_unknown)
        if can_write:
            action_lookup.update({
                'assay_action': self.handle_assay_measurement_delete,
                'disable': self.handle_line_delete,
                'study_delete': self.handle_study_delete,
            })
        return action_lookup

    def get_context_data(self, **kwargs):
        context = super(StudyDeleteView, self).get_context_data(**kwargs)
        request = kwargs.get('request')
        form = ExportSelectionForm(data=request.POST, user=request.user, exclude_disabled=False)
        context['delete_select'] = form
        context['measurement_count'] = form.selection.measurements.count()
        context['cancel_link'] = request.path
        return context

    def handle_assay_measurement_delete(self, request, context, *args, **kwargs):
        assay_action = request.POST.get('assay_action', None)
        print(f'assay_action = {assay_action}')
        if 'delete' != assay_action:
            return self.handle_unknown(request, context, *args, **kwargs)
        form = context['delete_select']
        formdata = form.clean()
        if len(formdata.get('assayId', [])) > 0:
            context['typename'] = _('Assay')
            context['item_names'] = [a.name for a in form.selection.assays[:10]]
        else:
            context['typename'] = _('Measurement')
            context['item_names'] = [
                m.measurement_type.type_name
                for m in form.selection.measurements[:10]
            ]
        context['confirm_action'] = 'assay_confirm_delete'
        return False

    def handle_line_delete(self, request, context, *args, **kwargs):
        form = context['delete_select']
        context['typename'] = _('Line')
        context['item_names'] = [l.name for l in form.selection.lines[:10]]
        context['confirm_action'] = 'disable_confirm'
        return False

    def handle_study_delete(self, request, context, *args, **kwargs):
        context['typename'] = _('Study')
        context['item_names'] = [self.get_object().name]
        context['confirm_action'] = 'delete_confirm'
        return False


class EDDExportView(generic.TemplateView):
    """ Base view for exporting EDD information. """
    def __init__(self, *args, **kwargs):
        super(EDDExportView, self).__init__(*args, **kwargs)
        self._export = None
        self._selection = ExportSelection(None)

    def get(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.GET))
        return self.render_to_response(context)

    def get_context_data(self, **kwargs):
        context = super(EDDExportView, self).get_context_data(**kwargs)
        return context

    def get_selection(self):
        return self._selection
    selection = property(get_selection)

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/export.html', ]

    def init_forms(self, request, payload):
        select_form = ExportSelectionForm(data=payload, user=request.user)
        try:
            self._selection = select_form.get_selection()
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return {
            'download': payload.get('action', None) == 'download',
            'select_form': select_form,
            'selection': self.selection,
        }

    def post(self, request, *args, **kwargs):
        context = self.get_context_data(**kwargs)
        context.update(self.init_forms(request, request.POST))
        return self.render_to_response(context)

    def render_to_response(self, context, **kwargs):
        if context.get('download', False) and self._export:
            response = HttpResponse(self._export.output(), content_type='text/csv')
            # set download filename as the first name in the exported studies
            study = self._export.selection.studies[0]
            response['Content-Disposition'] = 'attachment; filename="%s.csv"' % study.name
            return response
        return super(EDDExportView, self).render_to_response(context, **kwargs)


class ExportView(EDDExportView):
    """ View to export EDD information in a table/CSV format. """
    def init_forms(self, request, payload):
        context = super(ExportView, self).init_forms(request, payload)
        context.update(
            option_form=None,
            output='',
        )
        try:
            initial = ExportOptionForm.initial_from_user_settings(request.user)
            option_form = ExportOptionForm(data=payload, initial=initial, selection=self.selection)
            context.update(option_form=option_form)
            if option_form.is_valid():
                self._export = TableExport(self.selection, option_form.options, None)
                context.update(output=self._export.output())
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return context


class WorklistView(EDDExportView):
    """ View to export lines in a worklist template. """
    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/worklist.html', ]

    def init_forms(self, request, payload):
        context = super(WorklistView, self).init_forms(request, payload)
        worklist_form = WorklistForm()
        context.update(
            defaults_form=worklist_form.defaults_form,
            flush_form=worklist_form.flush_form,
            output='',
            worklist_form=worklist_form,
        )
        try:
            worklist_form = WorklistForm(data=payload)
            context.update(
                defaults_form=worklist_form.defaults_form,
                flush_form=worklist_form.flush_form,
                worklist_form=worklist_form,
            )
            if worklist_form.is_valid():
                self._export = WorklistExport(
                    self.selection,
                    worklist_form.options,
                    worklist_form.worklist,
                )
                context.update(output=self._export.output())
        except Exception as e:
            logger.exception("Failed to validate forms for export: %s", e)
        return context


class SbmlView(EDDExportView):
    def __init__(self, *args, **kwargs):
        super(SbmlView, self).__init__(*args, **kwargs)
        self.sbml_export = None

    def get_template_names(self):
        """ Override in child classes to specify alternate templates. """
        return ['main/sbml_export.html', ]

    def init_forms(self, request, payload):
        context = super(SbmlView, self).init_forms(request, payload)
        self.sbml_export = SbmlExport(self.selection)
        return self.sbml_export.init_forms(payload, context)

    def render_to_response(self, context, **kwargs):
        download = context.get('download', False)
        if download and self.sbml_export:
            match_form = context.get('match_form', None)
            time_form = context.get('time_form', None)
            if match_form and time_form and match_form.is_valid() and time_form.is_valid():
                time = time_form.cleaned_data['time_select']
                response = HttpResponse(
                    self.sbml_export.output(time, match_form.cleaned_data),
                    content_type='application/sbml+xml'
                )
                # set download filename
                filename = time_form.cleaned_data['filename']
                response['Content-Disposition'] = 'attachment; filename="%s"' % filename
                return response
        return super(SbmlView, self).render_to_response(context, **kwargs)


# /study/<study_id>/measurements/<protocol_id>/
def study_measurements(request, pk=None, slug=None, protocol=None):
    """ Request measurement data in a study. """
    obj = load_study(request, pk=pk, slug=slug)
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study=obj,
        measurement__assay__protocol_id=protocol,
    ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = Measurement.objects.filter(
        assay__line__study=obj,
        assay__protocol_id=protocol,
        active=True,
        assay__line__active=True,
    )
    # Limit the measurements returned to keep browser performance
    measurements = qmeasurements.order_by('id')[:5000]
    total_measures = qmeasurements.values('assay_id').annotate(count=Count('assay_id'))
    measure_list = list(measurements)
    if len(measure_list):
        # only try to pull values when we have measurement objects
        values = MeasurementValue.objects.filter(
            measurement__assay__line__study=obj,
            measurement__assay__protocol_id=protocol,
            measurement__active=True,
            measurement__assay__line__active=True,
            measurement__pk__range=(measure_list[0].id, measure_list[-1].id),
        )
    else:
        values = []
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        'total_measures': {
            x['assay_id']: x.get('count', 0) for x in total_measures if 'assay_id' in x
        },
        'types': {t.pk: t.to_json() for t in measure_types},
        'measures': [m.to_json() for m in measure_list],
        'data': value_dict,
    }
    return JsonResponse(payload, encoder=utilities.JSONEncoder)


# /study/<study_id>/measurements/<protocol_id>/<assay_id>/
def study_assay_measurements(request, pk=None, slug=None, protocol=None, assay=None):
    """ Request measurement data in a study, for a single assay. """
    obj = load_study(request, pk=pk, slug=slug)
    measure_types = MeasurementType.objects.filter(
        measurement__assay__line__study=obj,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
        ).distinct()
    # stash QuerySet to use in both measurements and total_measures below
    qmeasurements = Measurement.objects.filter(
        assay__line__study_id=obj.pk,
        assay__protocol_id=protocol,
        assay=assay,
        active=True,
        assay__active=True,
        assay__line__active=True,
        )
    # Limit the measurements returned to keep browser performant
    measurements = qmeasurements.order_by('id')[:5000]
    total_measures = qmeasurements.values('assay_id').annotate(count=Count('assay_id'))
    measure_list = list(measurements)
    values = MeasurementValue.objects.filter(
        measurement__assay__line__study_id=obj.pk,
        measurement__assay__protocol_id=protocol,
        measurement__assay=assay,
        measurement__active=True,
        measurement__assay__active=True,
        measurement__assay__line__active=True,
        measurement__id__range=(measure_list[0].id, measure_list[-1].id),
        )
    value_dict = collections.defaultdict(list)
    for v in values:
        value_dict[v.measurement_id].append((v.x, v.y))
    payload = {
        'total_measures': {
            x['assay_id']: x.get('count', 0) for x in total_measures if 'assay_id' in x
        },
        'types': {t.pk: t.to_json() for t in measure_types},
        'measures': [m.to_json() for m in measure_list],
        'data': value_dict,
    }
    return JsonResponse(payload, encoder=utilities.JSONEncoder)


# /study/search/
def study_search(request):
    """ View function handles incoming requests to search solr """
    solr = StudySearch(ident=request.user)
    query = request.GET.get('q', 'active:true')
    opt = request.GET.copy()
    opt['edismax'] = True
    data = solr.query(query=query, options=opt.dict())
    # loop through results and attach URL to each
    query_response = data['response']
    for doc in query_response['docs']:
        doc['url'] = reverse('main:detail', kwargs={'slug': doc['slug']})
    return JsonResponse(query_response, encoder=utilities.JSONEncoder)


# /study/<study_id>/edddata/
def study_edddata(request, pk=None, slug=None):
    """
    Various information (both global and study-specific) that populates the
    EDDData JS object on the client.
    """
    model = load_study(request, pk=pk, slug=slug)
    data_misc = get_edddata_misc()
    data_study = get_edddata_study(model)
    data_study.update(data_misc)
    return JsonResponse(data_study, encoder=utilities.JSONEncoder)


# /study/<study_id>/assaydata/
def study_assay_table_data(request, pk=None, slug=None):
    """ Request information on assays associated with a study. """
    model = load_study(request, pk=pk, slug=slug)
    active_param = request.GET.get('active', None)
    active_value = 'true' == active_param if active_param in ('true', 'false') else None
    active = qfilter(value=active_value, fields=['active'])
    existingLines = model.line_set.filter(active)
    existingAssays = edd_models.Assay.objects.filter(active, line__study=model)
    return JsonResponse({
        "ATData": {
            "existingLines": list(existingLines.values('name', 'id')),
            "existingAssays": {
                assays['protocol_id']: assays['ids']
                for assays in existingAssays.values('protocol_id').annotate(ids=ArrayAgg('id'))
            },
        },
        "EDDData": get_edddata_study(model),
    }, encoder=utilities.JSONEncoder)


# /study/<study_id>/map/
def study_map(request, pk=None, slug=None):
    """ Request information on metabolic map associated with a study. """
    obj = load_study(request, pk=pk, slug=slug)
    try:
        mmap = SBMLTemplate.objects.get(study=obj)
        return JsonResponse(
            {
                "name": mmap.name,
                "id": mmap.pk,
                "biomassCalculation": mmap.biomass_calculation,
            },
            encoder=utilities.JSONEncoder,
        )
    except SBMLTemplate.DoesNotExist as e:
        return JsonResponse(
            {"name": "", "biomassCalculation": -1, },
            encoder=utilities.JSONEncoder
        )
    except Exception as e:
        raise e


class StudyPermissionJSONView(StudyObjectMixin, generic.detail.BaseDetailView):
    """ Implements a REST-style view for /study/<id-or-slug>/permissions/ """

    def get(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        return JsonResponse([
            permission.to_json()
            for permission in instance.get_combined_permission()
        ])

    def head(self, request, *args, **kwargs):
        self.object = self.get_object()
        return HttpResponse(status=200)

    def post(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        self._check_write_permission(request)
        try:
            perms = json.loads(request.POST.get('data', '[]'))
            # make requested changes as a group, or not at all
            with transaction.atomic():
                for permission_def in perms:
                    self._handle_permission_update(permission_def)
        except Exception as e:
            logger.exception('Error modifying study (%s) permissions: %s', instance, e)
            return HttpResponse(status=500)
        return HttpResponse(status=204)

    # Treat PUT requests the same as POST
    put = post

    def delete(self, request, *args, **kwargs):
        instance = self.object = self.get_object()
        self._check_write_permission(request)
        try:
            # make requested changes as a group, or not at all
            with transaction.atomic():
                instance.everyonepermission_set.all().delete()
                instance.grouppermission_set.all().delete()
                instance.userpermission_set.all().delete()
        except Exception as e:
            logger.exception('Error deleting study (%s) permissions: %s', instance, e)
            return HttpResponse(status=500)
        return HttpResponse(status=204)

    def _check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(_("You do not have permission to modify this study."))

    def _handle_permission_update(self, permission_def):
        instance = self.get_object()
        ptype = permission_def.get('type', None)
        kwargs = dict(study=instance)
        defaults = dict(permission_type=ptype)
        if 'group' in permission_def:
            kwargs.update(group_id=permission_def['group'].get('id', 0))
            manager = instance.grouppermission_set
        elif 'user' in permission_def:
            kwargs.update(user_id=permission_def['user'].get('id', 0))
            manager = instance.userpermission_set
        elif 'public' in permission_def:
            manager = instance.everyonepermission_set

        if manager is None or ptype is None:
            logger.warning('Invalid permission type for add')
        elif ptype == StudyPermission.NONE:
            manager.filter(**kwargs).delete()
        else:
            kwargs.update(defaults=defaults)
            manager.update_or_create(**kwargs)


# /study/<study_id>/import/
@ensure_csrf_cookie
def study_import_table(request, pk=None, slug=None):
    """
    View for importing tabular data (replaces AssayTableData.cgi).
    :raises: Exception if an error occurrs during the import attempt
    """
    study = load_study(request, pk=pk, slug=slug, permission_type=StudyPermission.CAN_EDIT)
    user_can_write = study.user_can_write(request.user)

    # FIXME protocol display on import page should be an autocomplete
    protocols = Protocol.objects.order_by('name')

    if request.method == "POST":
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug('\n'.join([
                '%(key)s : %(value)s' % {'key': key, 'value': request.POST[key]}
                for key in sorted(request.POST)
            ]))
        try:
            storage = redis.ScratchStorage()
            # save POST to scratch space as urlencoded string
            key = storage.save(request.POST.urlencode())
            result = import_table_task.delay(study.pk, request.user.pk, key)
            # save task ID for notification later
            request.user.profile.tasks.create(uuid=result.id)
            messages.add_message(
                request,
                msg_constants.SUCCESS_PERSISTENT,
                _('Data is submitted for import. You may continue to use EDD, another message '
                  'will appear once the import is complete.')
            )
        except RuntimeError as e:
            logger.exception('Data import failed: %s', e.message)

            # show the first error message to the user. continuing the import attempt to collect
            # more potentially-useful errors makes the code too complex / hard to maintain.
            messages.error(request, e)
            # redirect to study page
        return HttpResponseRedirect(reverse('main:detail', kwargs={'slug': study.slug}))
    return render(
        request,
        "main/import.html",
        context={
            "study": study,
            "protocols": protocols,
            "writable": user_can_write,
        },
    )


# /study/<study_id>/describe/
@ensure_csrf_cookie
def study_describe_experiment(request, pk=None, slug=None):
    """
    View for defining a study's lines / assays from an Experiment Description file.
    """

    # load the study first to detect any permission errors / fail early
    study = load_study(request, pk=pk, slug=slug, permission_type=StudyPermission.CAN_EDIT)

    if request.method != "POST":
        raise MethodNotAllowed(request.method)

    # parse request parameter input to keep subsequent code relatively format-agnostic
    user = request.user
    dry_run = request.GET.get(DRY_RUN_PARAM, False)
    allow_duplicate_names = request.GET.get(ALLOW_DUPLICATE_NAMES_PARAM, False)
    ignore_ice_access_errors = request.GET.get(IGNORE_ICE_ACCESS_ERRORS_PARAM, False)
    allow_non_strains = request.GET.get(ALLOW_NON_STRAIN_PARTS, False)
    omit_strains = request.GET.get(OMIT_STRAINS, False)

    # detect the input format
    stream = request
    file = request.FILES.get('file', None)
    file_name = None
    if file:
        stream = file
        file_name = file.name
        if file.content_type not in EXCEL_TYPES:
            summary = ImportErrorSummary(BAD_FILE_CATEGORY, UNSUPPORTED_FILE_TYPE)
            summary.add_occurrence(file.content_type)
            errors = {BAD_FILE_CATEGORY: {UNSUPPORTED_FILE_TYPE: summary}}
            return JsonResponse(_build_response_content(errors, {}), status=codes.bad_request)

    options = ExperimentDescriptionOptions(allow_duplicate_names=allow_duplicate_names,
                                           allow_non_strains=allow_non_strains, dry_run=dry_run,
                                           ignore_ice_access_errors=ignore_ice_access_errors,
                                           use_ice_part_numbers=file_name,
                                           omit_strains=omit_strains)

    # attempt the import
    importer = CombinatorialCreationImporter(study, user)
    try:
        with transaction.atomic(savepoint=False):
            status_code, reply_content = importer.do_import(
                stream,
                options,
                excel_filename=file_name,
            )
        logger.debug('Reply content: %s' % json.dumps(reply_content))
        return JsonResponse(reply_content, status=status_code)

    except RuntimeError as e:
        # log the exception, but return a response to the GUI/client anyway to help it remain
        # responsive
        importer.add_error(INTERNAL_EDD_ERROR_CATEGORY, UNPREDICTED_ERROR, str(e))

        logger.exception('Unpredicted exception occurred during experiment description processing')

        importer.send_unexpected_err_email(dry_run,
                                           ignore_ice_access_errors,
                                           allow_duplicate_names)

        return JsonResponse(
            _build_response_content(importer.errors, importer.warnings),
            status=INTERNAL_SERVER_ERROR
        )


# /utilities/parsefile/
# To reach this function, files are sent from the client by the Utl.FileDropZone class (in Utl.ts).
def utilities_parse_import_file(request):
    """
    Attempt to process posted data as either a TSV or CSV file or Excel spreadsheet and extract a
    table of data automatically.
    """
    file = request.FILES.get('file')
    import_mode = request.POST.get('import_mode', parser.ImportModeFlags.STANDARD)

    parse_fn = parser.find_parser(import_mode, file.content_type)
    if parse_fn:
        try:
            result = parse_fn(file)
            return JsonResponse({
                'file_type': result.file_type,
                'file_data': result.parsed_data,
            })
        except Exception as e:
            logger.exception('Import file parse failed: %s', e)
            return JsonResponse({'python_error': str(e)}, status=500)
    return JsonResponse(
        {
            "python_error": "The uploaded file could not be interpreted as either an Excel "
                            "spreadsheet or an XML file.  Please check that the contents are "
                            "formatted correctly. (Word documents are not allowed!)"
        },
        status=500
    )


# /data/sbml/
def data_sbml(request):
    all_sbml = SBMLTemplate.objects.all()
    return JsonResponse(
        [sbml.to_json() for sbml in all_sbml],
        encoder=utilities.JSONEncoder,
        safe=False,
        )


# /data/sbml/<sbml_id>/
def data_sbml_info(request, sbml_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    return JsonResponse(sbml.to_json(), encoder=utilities.JSONEncoder)


# /data/sbml/<sbml_id>/reactions/
def data_sbml_reactions(request, sbml_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    return JsonResponse(
        [{
            "metabolicMapID": sbml_id,
            "reactionName": r.getName(),
            "reactionID": r.getId(),
        } for r in rlist if 'biomass' in r.getId()],
        encoder=utilities.JSONEncoder,
        safe=False,
        )


# /data/sbml/<sbml_id>/reactions/<rxn_id>/
def data_sbml_reaction_species(request, sbml_id, rxn_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    found = [r for r in rlist if rxn_id == r.getId()]
    if len(found):
        all_species = [
            rxn.getSpecies() for rxn in found[0].getListOfReactants()
            ] + [
            rxn.getSpecies() for rxn in found[0].getListOfProducts()
            ]
        matched = MetaboliteSpecies.objects.filter(
            species__in=all_species,
            sbml_template_id=sbml_id,
        ).select_related(
            'measurement_type',
        )
        matched_json = {m.species: m.measurement_type.to_json() for m in matched}
        unmatched = [s for s in all_species if s not in matched_json]
        # old EDD tries to generate SBML species names for all metabolites and match
        # below is the inverse; take a species name, try to extract short_name, and search
        guessed_json = {}

        def sub_symbol(name):
            name = re.sub(r'_DASH_', '-', name)
            name = re.sub(r'_LPAREN_', '(', name)
            name = re.sub(r'_RPAREN_', ')', name)
            name = re.sub(r'_LSQBKT_', '[', name)
            name = re.sub(r'_RSQBKT_', ']', name)
            return name
        for s in unmatched:
            match = re.search(r'^(?:M_)?(\w+?)(?:_c_?)?$', s)
            if match:
                candidate_names = [match.group(1), sub_symbol(match.group(1)), ]
                guessed = Metabolite.objects.filter(short_name__in=candidate_names)
                guessed_json.update({s: m.to_json() for m in guessed})
        # make sure actual matches take precedence
        guessed_json.update(matched_json)
        return JsonResponse(
            guessed_json,
            encoder=utilities.JSONEncoder,
            safe=False,
            )
    raise Http404("Could not find reaction")


# /data/sbml/<sbml_id>/reactions/<rxn_id>/compute/ -- POST ONLY --
def data_sbml_compute(request, sbml_id, rxn_id):
    sbml = get_object_or_404(SBMLTemplate, pk=sbml_id)
    rlist = sbml.load_reactions()
    found = [r for r in rlist if rxn_id == r.getId()]
    spp = request.POST.getlist('species', [])
    if len(found):
        def sumMetaboliteStoichiometries(species, info):
            total = 0
            for sp in species:
                try:
                    m = MetaboliteSpecies.objects.get(
                        species=sp.getSpecies(),
                        sbml_template_id=sbml_id,
                    ).select_related('measurement_type__metabolite')
                    total += sp.getStoichiometry() * m.measurement_type.metabolite.carbon_count
                    info.push(
                        {
                            "metaboliteName": sp.getSpecies(),
                            "stoichiometry": sp.getStoichiometry(),
                            "carbonCount": m.measurement_type.metabolite.carbon_count,
                        })
                except Exception:
                    pass
            return total
        reactants = [r for r in found[0].getListOfReactants() if r.getSpecies() in spp]
        products = [r for r in found[0].getListOfProducts() if r.getSpecies() in spp]
        reactant_info = []
        product_info = []
        biomass = sumMetaboliteStoichiometries(reactants, reactant_info)
        biomass -= sumMetaboliteStoichiometries(products, product_info)
        info = json.dumps(
            {
                "reaction_id": rxn_id,
                "reactants": reactant_info,
                "products": product_info,
            },
            cls=utilities.JSONEncoder)
        sbml.biomass_calculation = biomass
        sbml.biomass_calculation_info = info
        sbml.save()
        return JsonResponse(biomass, encoder=utilities.JSONEncoder, safe=False)
    raise Http404("Could not find reaction")


meta_pattern = re.compile(r'(\w*)MetadataType$')


# /search
def search(request):
    """ Naive implementation of model-independent server-side autocomplete backend,
        paired with EDDAutocomplete.js on the client side. Call out to Solr or ICE where
        needed. """
    return model_search(request, request.GET["model"])


AUTOCOMPLETE_VIEW_LOOKUP = {
    'GenericOrMetabolite': autocomplete.search_metaboliteish,
    'Group': autocomplete.search_group,
    'MeasurementCompartment': autocomplete.search_compartment,
    'MetaboliteExchange': autocomplete.search_sbml_exchange,
    'MetaboliteSpecies': autocomplete.search_sbml_species,
    'Registry': autocomplete.search_strain,
    'Strain': autocomplete.search_strain,
    'StudyWritable': autocomplete.search_study_writable,
    'StudyLine': autocomplete.search_study_lines,
    'User': autocomplete.search_user,
}


# /search/<model_name>/
def model_search(request, model_name):
    searcher = AUTOCOMPLETE_VIEW_LOOKUP.get(model_name, None)
    try:
        if searcher:
            return searcher(request)
        elif meta_pattern.match(model_name):
            match = meta_pattern.match(model_name)
            return autocomplete.search_metadata(request, match.group(1))
        else:
            return autocomplete.search_generic(request, model_name)

    except ValidationError as v:
        return JsonResponse(v.message, status=400)


# /demo/
def websocket_demo(request):
    return render(request, 'main/websocket_demo.html')
