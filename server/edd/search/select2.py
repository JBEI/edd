import itertools
import json
import logging
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import F, Q, Value
from django.template.loader import get_template
from django.utils.translation import gettext as _

from main import models as edd_models

from . import registry, solr

logger = logging.getLogger(__name__)


class Autocomplete:

    DEFAULT_RESULT_COUNT = 20

    def __init__(self, model):
        self.model = model

    def dispatch(self, request):
        """
        Build a QuerySet or other search for the incoming request. Return a
        list of items found and a flag for more matching items.
        """
        match self.model:
            case "Compartment":
                return self._compartment(request), False
            case "Gene":
                return self._gene(request)
            case "GenericOrMetabolite":
                return self._metaboliteish(request)
            case "Group":
                return self._group(request)
            case "Metabolite":
                return self._metabolite(request)
            case "MetadataType":
                return self._metadata(request)
            case "Permission":
                return self._permission(request)
            case "Protein":
                return self._protein(request)
            case "Protocol":
                return self._protocol(request)
            case "Registry" | "Strain":
                return self._registry(request)
            case "SbmlExchange":
                return self._sbml_exchange(request)
            case "SbmlSpecies":
                return self._sbml_species(request)
            case "Unit":
                return self._unit(request)
            case "User":
                return self._user(request)
            case _:
                raise ValueError(f"Unsupported model for autocomplete: '{self.model}'")

    def get_term(self, request):
        term = request.GET.get("term", "")
        return re.escape(term)

    def get_range(self, request):
        page = int(request.GET.get("page", "1"))
        end = page * self.DEFAULT_RESULT_COUNT
        start = end - self.DEFAULT_RESULT_COUNT
        return start, end

    def search(self, request):
        try:
            items, more = self.dispatch(request)
            return {
                "pagination": {
                    "more": more,
                },
                "results": list(items),
            }
        except Exception as e:
            logger.exception(f"Invalid parameters to autocomplete search: {e}")
            raise e

    def _compartment(self, request):
        # only 3 elements, just always return the whole thing
        return [
            {"id": c[0], "text": str(c[1])}
            for c in edd_models.Measurement.Compartment.CHOICE
        ]

    def _gene(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        found = edd_models.GeneIdentifier.objects.filter(
            type_name__iregex=term
        ).order_by("type_name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("type_name"))
        count = found.count()
        # expect items to have an "id" field and "text" field, at minimum
        return found.values("id", "type_name", "text")[start:end], count > end

    def _group(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        found = Group.objects.filter(name__iregex=term).order_by("name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("name"))
        count = found.count()
        # expect items to have an "id" field and "text" field, at minimum
        return found.values("id", "name", "text")[start:end], count > end

    def _metabolite(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        q = Q(type_name__iregex=term) | Q(smiles__iregex=term)
        found = edd_models.Metabolite.objects.filter(q).order_by("type_name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("type_name"))
        count = found.count()
        # expect items to have an "id" field and "text" field, at minimum
        return (
            found.values("id", "pubchem_cid", "smiles", "type_name", "text")[start:end],
            count > end,
        )

    def _metaboliteish(self, request):
        """
        Autocomplete for "metabolite-ish" values; metabolites and
        general measurements.
        """
        core = solr.MeasurementTypeSearch()
        term = request.GET.get("term", "")
        start, end = self.get_range(request)
        result = core.query(query=term, i=start, size=self.DEFAULT_RESULT_COUNT)
        response = result.get("response", ())
        items = response.get("docs", [])
        count = response.get("numFound", 0)
        return items, count > end

    def _metadata(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        type_filter = self._metadata_filter(request)
        found = edd_models.MetadataType.objects.filter(
            Q(type_name__iregex=term) | Q(group__group_name__iregex=term),
            type_filter,
        )
        found = found.annotate(
            group_name=F("group__group_name"),
            text=F("type_name"),
        )
        count = found.count()
        return (
            found.values("id", "type_name", "description", "group_name", "text")[
                start:end
            ],
            count > end,
        )

    def _metadata_filter(self, request):
        match request.GET.get("type", ""):
            case "Assay":
                return Q(for_context=edd_models.MetadataType.ASSAY)
            case "AssayForm":
                return Q(
                    for_context=edd_models.MetadataType.ASSAY,
                    type_field__isnull=True,
                )
            case "AssayLine":
                return Q(
                    for_context__in=(
                        edd_models.MetadataType.ASSAY,
                        edd_models.MetadataType.LINE,
                    )
                )
            case "Line":
                return Q(for_context=edd_models.MetadataType.LINE)
            case "LineForm":
                return Q(
                    for_context=edd_models.MetadataType.LINE,
                    type_field__isnull=True,
                )
            case "Study":
                return Q(for_context=edd_models.MetadataType.STUDY)
            case _:
                logger.warning(
                    "No type specified for metadata autocomplete, filtering on all metadata"
                )
                return Q()

    def _permission(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        # unified fields so both User and Group can be queried together
        value_fields = ("id", "text", "type", "backup")
        groups = Group.objects.filter(name__iregex=term)
        # display the name always, use name as sort key "backup"
        groups = groups.annotate(
            text=F("name"),
            type=Value("group"),
            backup=F("name"),
        )
        groups = groups.values(*value_fields)
        q = (
            Q(username__iregex=term)
            | Q(first_name__iregex=term)
            | Q(last_name__iregex=term)
            | Q(emailaddress__email__iregex=term)
            | Q(userprofile__initials__iregex=term)
        )
        User = get_user_model()
        users = User.profiles.filter(q).distinct()
        # display display_name preferentially, fallback to username as "backup"
        users = users.annotate(
            text=F("userprofile__display_name"),
            type=Value("user"),
            backup=F("username"),
        )
        users = users.values(*value_fields)
        union = groups.union(users).order_by("backup")
        count = union.count()
        template = get_template("edd/profile/permission_autocomplete_item.html")
        items = [
            {
                "html": template.render({"item": item}),
                "id": json.dumps(item),
                "text": item.get("text", _("Unknown Record")),
                "type": "",
                "backup": "",
            }
            for item in union[start:end]
        ]
        if start == 0:
            everyone = {"type": "everyone"}
            # add an entry for "everyone" permission at top of the list
            items = [
                {
                    "html": template.render({"item": everyone}),
                    "id": json.dumps(everyone),
                    "text": _("Any User"),
                    "type": "everyone",
                    "backup": "",
                },
                *items,
            ]
        return items, count > end

    def _protein(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        q = Q(type_name__iregex=term) | Q(accession_id__iregex=term)
        found = edd_models.ProteinIdentifier.objects.filter(q).order_by("type_name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("type_name"))
        count = found.count()
        # expect items to have an "id" field and "text" field, at minimum
        return (
            found.values("id", "accession_id", "type_name", "text")[start:end],
            count > end,
        )

    def _protocol(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        found = edd_models.Protocol.objects.filter(name__iregex=term).order_by("name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("name"))
        count = found.count()
        # expect items to have an "id" field and "text" field, at minimum
        return found.values("id", "name", "text")[start:end], count > end

    def _sbml_exchange(self, request):
        term = self.get_term(request)
        template = request.GET.get("template", "")
        start, end = self.get_range(request)
        q = (
            Q(reactant_name__iregex=term)
            | Q(exchange_name__iregex=term)
            | Q(measurement_type__type_name__iregex=term)
        )
        found = edd_models.MetaboliteExchange.objects.filter(
            q, sbml_template_id=template
        ).order_by("exchange_name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("measurement_type__type_name"))
        count = found.count()
        return (
            found.values("id", "exchange_name", "reactant_name", "text")[start:end],
            count > end,
        )

    def _sbml_species(self, request):
        term = self.get_term(request)
        template = request.GET.get("template", "")
        start, end = self.get_range(request)
        q = (
            Q(species__iregex=term)
            | Q(short_code__iregex=term)
            | Q(measurement_type__type_name__iregex=term)
        )
        found = edd_models.MetaboliteExchange.objects.filter(
            q, sbml_template_id=template
        ).order_by("species")
        found = optional_sort(request, found)
        found = found.annotate(text=F("measurement_type__type_name"))
        count = found.count()
        return (
            found.values("id", "exchange_name", "reactant_name", "text")[start:end],
            count > end,
        )

    def _strain(self, request):
        """Autocomplete delegates to ICE search API."""
        ice = registry.StrainRegistry()
        start, end = self.get_range(request)
        with ice.login(request.user):
            # NOTE: this API only supports starting index,
            # plus gives no indication of further elements
            search = ice.search_page(request.GET.get("term", ""), start)
            return [
                {"text": entry.name, **entry.payload}
                for entry in itertools.islice(search, self.DEFAULT_RESULT_COUNT)
            ], False

    def _unit(self, request):
        term = self.get_term(request)
        start, end = self.get_range(request)
        found = edd_models.MeasurementUnit.objects.filter(
            unit_name__iregex=term
        ).order_by("unit_name")
        found = optional_sort(request, found)
        found = found.annotate(text=F("unit_name"))
        count = found.count()
        return found.values("id", "text", "unit_name")[start:end], count > end

    def _user(self, request):
        User = get_user_model()
        term = self.get_term(request)
        start, end = self.get_range(request)
        q = (
            Q(username__iregex=term)
            | Q(first_name__iregex=term)
            | Q(last_name__iregex=term)
            | Q(emailaddress__email__iregex=term)
            | Q(userprofile__initials__iregex=term)
        )
        found = User.profiles.filter(q).distinct().order_by("username")
        found = optional_sort(request, found)
        count = found.count()
        template = get_template("edd/profile/user_autocomplete_item.html")
        return [
            {
                "html": template.render({"user": user}),
                "id": user.id,
                "initials": user.initials,
                "text": user.profile.display_name,
                "username": user.username,
            }
            for user in found[start:end]
        ], count > end


def optional_sort(request, queryset):
    sort_field = request.GET.get("sort", None)

    if not sort_field:
        return queryset

    return queryset.order_by(sort_field)
