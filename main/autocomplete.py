# coding: utf-8

import operator
import logging
import re

from django.conf import settings
from django.db.models import Q
from django.http import JsonResponse
from django.contrib.auth.models import Group
from functools import reduce

from rest_framework.exceptions import ValidationError

from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi
from main.models import Line, Study, StudyPermission
from main.models.common import qfilter
from . import models as edd_models, solr

DEFAULT_RESULT_COUNT = 20

logger = logging.getLogger(__name__)


def search_compartment(request):
    """ Autocomplete for measurement compartments; e.g. intracellular """
    # this list is short, always just return the entire thing instead of searching
    return JsonResponse({
        'rows': [
            {'id': c[0], 'name': str(c[1])}
            for c in edd_models.Measurement.Compartment.CHOICE
        ],
    })


def search_generic(request, model_name, module=edd_models):
    """ A generic model search function; runs a regex search on all text-like fields on a model,
        limited to 20 items. Defaults to loading model from the EDD model module, pass in a
        module kwarg to specify a different module. """
    try:
        Model = getattr(module, model_name)
        ifields = [
            f.get_attname()
            for f in Model._meta.get_fields()
            if hasattr(f, 'get_attname') and f.get_internal_type() in ['TextField', 'CharField']
        ]
    except AttributeError as e:
        return JsonResponse({'error': 'Unknown search model %s' % model_name}, status=400)
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    term_filters = [Q(**{'%s__iregex' % f: re_term}) for f in ifields]
    found = Model.objects.filter(reduce(operator.or_, term_filters, Q()))[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


def search_group(request):
    """ Autocomplete for Groups of users. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    found = Group.objects.filter(name__iregex=re_term).order_by('name').values('id', 'name')
    found = optional_sort(request, found)
    found = found[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': list(found),  # force QuerySet to list
    })


def search_metaboliteish(request):
    """ Autocomplete for "metaboliteish" values; metabolites and general measurements. """
    core = solr.MeasurementTypeSearch()
    term = request.GET.get('term', '')
    found = core.query(query=term)
    return JsonResponse({
        'rows': found.get('response', {}).get('docs', []),
    })


AUTOCOMPLETE_METADATA_LOOKUP = {
    'Assay': Q(for_context=edd_models.MetadataType.ASSAY),
    'AssayLine': Q(for_context__in=[edd_models.MetadataType.ASSAY, edd_models.MetadataType.LINE]),
    'Line': Q(for_context=edd_models.MetadataType.LINE),
    'Study': Q(for_context=edd_models.MetadataType.STUDY),
}


def search_metadata(request, context):
    """ Autocomplete search on metadata in a context; supported contexts are: 'Assay', 'AssayLine',
        'Line', and 'Study'. If none of these contexts are provided, then all metadata types
        are searched. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)

    term_filters = [
        Q(type_name__iregex=re_term),
        Q(group__group_name__iregex=re_term),
    ]

    type_filter = AUTOCOMPLETE_METADATA_LOOKUP.get(context, Q())
    q_filter = reduce(operator.or_, term_filters, Q()) & type_filter
    found_qs = edd_models.MetadataType.objects.filter(q_filter).select_related('group')
    found_qs = optional_sort(request, found_qs)

    return JsonResponse({
        'rows': [item.to_json() for item in found_qs[:DEFAULT_RESULT_COUNT]],
    })


def optional_sort(request, queryset):
    sort_field = request.GET.get('sort', None)

    if not sort_field:
        return queryset

    return queryset.order_by(sort_field)


def search_study_lines(request):
    """ Autocomplete search on lines in a study."""
    study_pk = request.GET.get('study', '')
    name_regex = re.escape(request.GET.get('term', ''))
    active_param = request.GET.get('active', None)
    active_value = 'true' == active_param if active_param in ('true', 'false') else None
    active = qfilter(value=active_value, fields=['active'])
    user = request.user

    if (not study_pk) or (not study_pk.isdigit()):
        raise ValidationError('study parameter is required and must be a valid integer')

    permission_check = Study.user_permission_q(user, StudyPermission.READ)
    # if the user's admin / staff role gives read access to all Studies, don't bother querying
    # the database for specific permissions defined on this study
    if Study.user_role_can_read(user):
        permission_check = Q()
    try:
        # Note: distinct() necessary in case the user has multiple permission paths to access
        # the study (e.g. individual and group permissions)
        study = Study.objects.filter(permission_check, pk=study_pk).distinct().get()
        query = study.line_set.filter(active)

    # if study doesn't exist or requesting user doesn't have read access, return an empty
    # set of lines
    except Study.DoesNotExist as e:
        query = Line.objects.none()

    query = query.filter(Q(name__iregex=name_regex) | Q(strains__name__iregex=name_regex))
    query = optional_sort(request, query)
    query = query.values('name', 'id')[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': list(query),
    })


def search_sbml_exchange(request):
    """ Autocomplete search within an SBMLTemplate's Reactions/Exchanges """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    template = request.GET.get('template', None)
    found = edd_models.MetaboliteExchange.objects.filter(
        Q(sbml_template_id=template),
        Q(reactant_name__iregex=re_term) | Q(exchange_name__iregex=re_term)
    ).order_by('exchange_name', 'reactant_name')[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': [{
            'id': item.pk,
            'exchange': item.exchange_name,
            'reactant': item.reactant_name,
        } for item in found],
    })


def search_sbml_species(request):
    """ Autocomplete search within an SBMLTemplate's Species """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    template = request.GET.get('template', None)
    found = edd_models.MetaboliteSpecies.objects.filter(
        sbml_template_id=template, species__iregex=re_term,
    ).order_by('species')[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': [{
            'id': item.pk,
            'name': item.species,
        } for item in found],
    })


def search_strain(request):
    """ Autocomplete delegates to ICE search API. """
    auth = HmacAuth(key_id=settings.ICE_KEY_ID, username=request.user.email)
    ice = IceApi(auth=auth, verify_ssl_cert=settings.VERIFY_ICE_CERT)
    ice.timeout = settings.ICE_REQUEST_TIMEOUT
    term = request.GET.get('term', '')
    results = ice.search(term)
    return JsonResponse({
        'rows': results,
    })


def search_study_writable(request):
    """ Autocomplete searches for any Studies writable by the currently logged in user. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    perm = edd_models.StudyPermission.WRITE
    found = edd_models.Study.objects.distinct().filter(
        Q(name__iregex=re_term) | Q(description__iregex=re_term),
        edd_models.Study.user_permission_q(request.user, perm),
    )[:DEFAULT_RESULT_COUNT]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


def search_user(request):
    """ Autocomplete delegates searches to the Solr index of users. """
    core = solr.UserSearch()
    term = request.GET.get('term', '')
    options = {'edismax': True}
    active_param = request.GET.get('active', None)
    if active_param in ('true', 'false'):
        options['is_active'] = 'true' == active_param
    found = core.query(query=term, options=options)
    return JsonResponse({
        'rows': found.get('response', {}).get('docs', []),
    })
