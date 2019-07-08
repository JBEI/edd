# coding: utf-8
"""
Views that handle search operations in EDD.
"""

import logging
import re

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.urls import reverse
from requests import codes

from edd import utilities

from .. import autocomplete
from ..solr import StudySearch

logger = logging.getLogger(__name__)


# /study/search/
def study_search(request):
    """ View function handles incoming requests to search solr """
    # TODO: uncovered code
    solr = StudySearch(ident=request.user)
    query = request.GET.get("q", "active:true")
    opt = request.GET.copy()
    opt["edismax"] = True
    data = solr.query(query=query, options=opt.dict())
    # loop through results and attach URL to each
    query_response = data["response"]
    for doc in query_response["docs"]:
        doc["url"] = reverse("main:detail", kwargs={"slug": doc["slug"]})
    return JsonResponse(query_response, encoder=utilities.JSONEncoder)
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
        return JsonResponse(str(v), status=codes.bad_request)
    # END uncovered
