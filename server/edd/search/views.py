"""
Views that handle search operations in EDD.
"""

import itertools
import logging
import re
from http import HTTPStatus

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.urls import reverse
from django.views import View

from edd import utilities

from . import autocomplete, select2
from .solr import StudySearch

logger = logging.getLogger(__name__)


def _datatable_order(params):
    """
    Extract ordering parameters from Datatables requests.
    """
    count = itertools.count()
    # loop over all "order[i][column]" fields
    while (i := next(count), c := params.get(f"order[{i}][column]")) and c:
        # convert "order[i][column]" to "columns[c][data]" key for field name
        if (f := f"columns[{c}][data]") and f in params:
            yield (params.get(f), params.get(f"order[{i}][dir]", "asc"))


def _datatable_solr_study_sort(params):
    """
    Convert Datatables ordering to Solr sort field(s).
    """
    orders = _datatable_order(params)
    # translate the text fields into their sorted field versions
    sorted_fields = {
        "creator": "creator_s",
        "description": "desc_s",
        "name": "name_s",
    }
    # use sorted version if mapping exists, otherwise use field name
    return ",".join(f"{sorted_fields.get(o[0], o[0])} {o[1]}" for o in orders)


# /study/search/
def study_search(request):
    """View function handles incoming requests to search solr"""
    # TODO: uncovered code
    solr = StudySearch(ident=request.user)
    query = request.GET.get("search[value]", "active:true")
    draw = int(request.GET.get("draw", 0))
    opt = {
        "edismax": True,
        "i": request.GET.get("start", 0),
        "size": request.GET.get("length", 50),
        "sort": _datatable_solr_study_sort(request.GET),
    }
    data = solr.query(query=query, options=opt)
    # loop through results and attach URL to each
    query_response = data["response"]
    for doc in query_response["docs"]:
        doc["url"] = reverse("main:detail", kwargs={"slug": doc["slug"]})
    return JsonResponse(
        {
            "draw": draw,
            "recordsTotal": query_response["numTotal"],
            "recordsFiltered": query_response["numFound"],
            "data": query_response["docs"],
        },
        encoder=utilities.JSONEncoder,
    )
    # END uncovered


meta_pattern = re.compile(r"(\w*)MetadataType$")


# /search
def search(request):
    """
    Naive implementation of model-independent server-side autocomplete backend,
    paired with EDDAutocomplete.js on the client side. Call out to Solr or ICE
    where needed.
    """
    # TODO: uncovered code
    return model_search(request, request.GET["model"])
    # END uncovered


AUTOCOMPLETE_VIEW_LOOKUP = {
    "GenericOrMetabolite": autocomplete.search_metaboliteish,
    "Group": autocomplete.search_group,
    "MeasurementCompartment": autocomplete.search_compartment,
    "MetaboliteExchange": autocomplete.search_sbml_exchange,
    "MetaboliteSpecies": autocomplete.search_sbml_species,
    "Registry": autocomplete.search_strain,
    "Strain": autocomplete.search_strain,
    "StudyWritable": autocomplete.search_study_writable,
    "StudyLine": autocomplete.search_study_lines,
    "User": autocomplete.search_user,
}


# /search/<model_name>/
def model_search(request, model_name):
    # TODO: uncovered code
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
        return JsonResponse(str(v), status=HTTPStatus.BAD_REQUEST)
    # END uncovered


# /auto/<model>/ OR /auto/?model=<model>
class AutocompleteView(View):
    """
    Implementation of a model-independent server-side autocomplete backend for
    the select2 library.
    """

    def get(self, request, *args, **kwargs):
        try:
            model = self.kwargs.get("model", None) or request.GET.get("model", None)
            auto = select2.Autocomplete(model)
            return JsonResponse(auto.search(request))
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=HTTPStatus.BAD_REQUEST)
