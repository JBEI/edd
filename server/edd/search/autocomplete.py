import logging
import operator
import re
from functools import reduce

from django.db.models import Q
from django.http import JsonResponse

from main import models as edd_models

DEFAULT_RESULT_COUNT = 20

logger = logging.getLogger(__name__)


AUTOCOMPLETE_METADATA_LOOKUP = {
    "Assay": Q(for_context=edd_models.MetadataType.ASSAY),
    "AssayForm": Q(for_context=edd_models.MetadataType.ASSAY, type_field__isnull=True),
    "AssayLine": Q(for_context__in=[edd_models.MetadataType.ASSAY, edd_models.MetadataType.LINE]),
    "Line": Q(for_context=edd_models.MetadataType.LINE),
    "LineForm": Q(for_context=edd_models.MetadataType.LINE, type_field__isnull=True),
    "Study": Q(for_context=edd_models.MetadataType.STUDY),
}


def search_metadata(request, context):
    """
    Autocomplete search on metadata in a context; supported contexts are:
    'Assay', 'AssayLine', 'Line', and 'Study'. If none of these contexts are
    provided, then all metadata types are searched.
    """
    term = request.GET.get("term", "")
    re_term = re.escape(term)

    term_filters = [Q(type_name__iregex=re_term), Q(group__group_name__iregex=re_term)]

    # if requested, filter out metadata types that reference a field on the model object
    type_filter = AUTOCOMPLETE_METADATA_LOOKUP.get(context, Q())
    q_filter = reduce(operator.or_, term_filters, Q()) & type_filter
    found_qs = edd_models.MetadataType.objects.filter(q_filter).select_related("group")
    found_qs = optional_sort(request, found_qs)

    return JsonResponse({"rows": [item.to_json() for item in found_qs[:DEFAULT_RESULT_COUNT]]})


def optional_sort(request, queryset):
    sort_field = request.GET.get("sort", None)

    if not sort_field:
        return queryset

    return queryset.order_by(sort_field)


def search_sbml_exchange(request):
    """Autocomplete search within an SBMLTemplate's Reactions/Exchanges"""
    term = request.GET.get("term", "")
    re_term = re.escape(term)
    template = request.GET.get("template", None)
    found = edd_models.MetaboliteExchange.objects.filter(
        Q(sbml_template_id=template),
        Q(reactant_name__iregex=re_term) | Q(exchange_name__iregex=re_term),
    ).order_by("exchange_name", "reactant_name")[:DEFAULT_RESULT_COUNT]
    return JsonResponse(
        {
            "rows": [
                {
                    "id": item.pk,
                    "exchange": item.exchange_name,
                    "reactant": item.reactant_name,
                }
                for item in found
            ]
        }
    )


def search_sbml_species(request):
    """Autocomplete search within an SBMLTemplate's Species"""
    term = request.GET.get("term", "")
    re_term = re.escape(term)
    template = request.GET.get("template", None)
    found = edd_models.MetaboliteSpecies.objects.filter(
        sbml_template_id=template, species__iregex=re_term
    ).order_by("species")[:DEFAULT_RESULT_COUNT]
    return JsonResponse({"rows": [{"id": item.pk, "name": item.species} for item in found]})
