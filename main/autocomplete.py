# coding: utf-8
from __future__ import unicode_literals

import operator
import re

from django.db.models import Q
from django.http import JsonResponse
from django.contrib.auth.models import Group
from functools import reduce

from jbei.ice.rest.ice import HmacAuth, IceApi
from . import models as edd_models
from .solr import UserSearch


def search_compartment(request):
    """ Autocomplete for measurement compartments; e.g. intracellular """
    # this list is short, always just return the entire thing instead of searching
    return JsonResponse({
        'rows': [
            {'id': c[0], 'name': c[1]}
            for c in edd_models.MeasurementCompartment.GROUP_CHOICE
        ],
    })


def search_generic(request, model_name, module=edd_models):
    """ A generic model search function; runs a regex search on all text-like fields on a model,
        limited to 20 items. Defaults to loading model from the EDD model module, pass in a
        module kwarg to specify a different module. """
    Model = getattr(module, model_name)
    ifields = [
        f.get_attname()
        for f in Model._meta.get_fields()
        if hasattr(f, 'get_attname') and f.get_internal_type() in ['TextField', 'CharField']
    ]
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    term_filters = [Q(**{'%s__iregex' % f: re_term}) for f in ifields]
    found = Model.objects.filter(reduce(operator.or_, term_filters, Q()))[:20]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


def search_group(request):
    """ Autocomplete for Groups of users. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    found = Group.objects.filter(name__iregex=re_term).order_by('name').values('id', 'name')[:20]
    return JsonResponse({
        'rows': found,
    })


def search_metaboliteish(request):
    """ Autocomplete for "metaboliteish" values; metabolites and general measurements. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    groups = (edd_models.MeasurementGroup.GENERIC, edd_models.MeasurementGroup.METABOLITE)
    found = edd_models.MeasurementType.objects.filter(
        Q(type_group__in=groups), Q(type_name__iregex=re_term) | Q(short_name__iregex=re_term)
    )[:20]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


AUTOCOMPLETE_METADATA_LOOKUP = {
    'Assay': Q(for_context=edd_models.MetadataType.ASSAY),
    'AssayLine': Q(for_context__in=[edd_models.MetadataType.ASSAY, edd_models.MetadataType.LINE]),
    'Line': Q(for_context=edd_models.MetadataType.LINE),
    'Study': Q(for_context=edd_models.MetadataType.STUDY),
}


def search_metadata(request, context):
    """ Autocomplete search on metadata in a context; supported contexts are: 'Assay', 'AssayLine',
        'Line', and 'Study'. """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    filters = [
        Q(type_name__iregex=re_term),
        Q(group__group_name__iregex=re_term),
        AUTOCOMPLETE_METADATA_LOOKUP.get(context, Q()),
    ]
    found = edd_models.MetadataType.objects.filter(reduce(operator.or_, filters, Q()))[:20]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


def search_sbml_exchange(request):
    """ Autocomplete search within an SBMLTemplate's Reactions/Exchanges """
    term = request.GET.get('term', '')
    re_term = re.escape(term)
    template = request.GET.get('template', None)
    found = edd_models.MetaboliteExchange.objects.filter(
        Q(sbml_template_id=template),
        Q(reactant_name__iregex=re_term) | Q(exchange_name__iregex=re_term)
    ).order_by('exchange_name', 'reactant_name')[:20]
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
    ).order_by('species')[:20]
    return JsonResponse({
        'rows': [{
            'id': item.pk,
            'name': item.species,
        } for item in found],
    })


def search_strain(request):
    """ Autocomplete delegates to ICE search API. """
    auth = HmacAuth.get(username=request.user.email)
    ice = IceApi(auth=auth)
    term = request.GET.get('term', '')
    found = ice.search_for_part(term, suppress_errors=True)
    results = []
    if found is not None:  # None == there were errors searching
        results = [match.get('entryInfo', dict()) for match in found.get('results', [])]
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
        Q(userpermission__user=request.user, userpermission__permission_type=perm) |
        Q(grouppermission__group__user=request.user, grouppermission__permission_type=perm)
    )[:20]
    return JsonResponse({
        'rows': [item.to_json() for item in found],
    })


def search_user(request):
    """ Autocomplete delegates searches to the Solr index of users. """
    solr = UserSearch()
    term = request.GET.get('term', '')
    found = solr.query(query=term, options={'edismax': True})
    return JsonResponse({
        'rows': found.get('response', {}).get('docs', []),
    })
