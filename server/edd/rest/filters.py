"""Defines filters for EDD's REST API."""

import logging
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import CharField, F, Func, IntegerField, Q, Value
from django.db.models.functions import Cast, Coalesce, Concat, NullIf
from django.utils.translation import gettext as _
from django_filters import filters as django_filters
from django_filters import rest_framework as filters

from main import models

logger = logging.getLogger(__name__)
User = get_user_model()


def filter_in_study(queryset, name, value):
    q = Q(study__slug=value)
    # try to convert to a PK
    try:
        q = q | Q(study_id=int(value))
    except ValueError:
        pass
    # try to convert to a UUID
    try:
        q = q | Q(study__uuid=UUID(value))
    except ValueError:
        pass
    return queryset.filter(q)


class EDDObjectFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(
        field_name="active",
        help_text=_(
            "Filter on currently active/visible items (True/1/yes or false/0/no)"
        ),
    )
    created_before = django_filters.IsoDateTimeFilter(
        field_name="created__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="lte",
    )
    created_after = django_filters.IsoDateTimeFilter(
        field_name="created__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="gte",
    )
    description = django_filters.CharFilter(
        field_name="description",
        help_text=_("Runs a regular expression search on item description"),
        lookup_expr="iregex",
    )
    name = django_filters.CharFilter(
        field_name="name",
        help_text=_("Runs a regular expression search on item name"),
        lookup_expr="iregex",
    )
    updated_before = django_filters.IsoDateTimeFilter(
        field_name="updated__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="lte",
    )
    updated_after = django_filters.IsoDateTimeFilter(
        field_name="updated__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="gte",
    )

    class Meta:
        model = models.EDDObject
        fields = []

    @classmethod
    def truthy(cls, value):
        """
        Utility to check if a string filter value is Boolean True for filtering.
        Accepts case-insensitive "true", "yes", "t", "y", "1" as True. All
        other values are treated as False.
        """
        return str(value).lower() in {"true", "t", "yes", "y", "1"}


class StudyFilter(EDDObjectFilter):
    contact = django_filters.ModelChoiceFilter(
        field_name="contact",
        help_text=_("ID of the user set as the Study contact"),
        queryset=User.objects.all(),
    )
    slug = django_filters.CharFilter(
        field_name="slug",
        help_text=_("The exact value of the study URL slug"),
        lookup_expr="exact",
    )

    class Meta:
        model = models.Study
        fields = []


class LineFilter(EDDObjectFilter):
    contact = django_filters.ModelChoiceFilter(
        field_name="contact",
        help_text=_("ID of the user set as the Line contact"),
        queryset=User.objects.all(),
    )
    control = django_filters.BooleanFilter(
        field_name="control",
        help_text=_("Filter on Lines marked as controls (True/1/yes or false/0/no)"),
    )
    experimenter = django_filters.ModelChoiceFilter(
        field_name="experimenter",
        help_text=_("ID of the user set as the Line experimenter"),
        queryset=User.objects.all(),
    )
    in_study = django_filters.CharFilter(
        field_name="study",
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method=filter_in_study,
    )
    replicates = django_filters.CharFilter(
        help_text=_("Flag to organize Lines by grouping together replicates"),
        method="group_replicates",
    )
    strain = django_filters.CharFilter(
        field_name="strains",
        help_text=_("Search on a strain UUID or registry URLs, separated by commas"),
        method="filter_strains",
    )
    study = django_filters.ModelChoiceFilter(
        field_name="study",
        help_text=_("ID of the study the Line(s) are linked to"),
        queryset=models.Study.objects.all(),
    )

    class Meta:
        model = models.Line
        fields = []

    def filter_strains(self, queryset, name, values):
        # split out multiple values similar to other django_filters 'in' param processing
        uuid_values, url_values = [], []
        for value in values.split(","):
            try:
                uuid_values.append(UUID(value))
            except ValueError:
                url_values.append(value)
        match_uuid = Q(strains__registry_id__in=uuid_values)
        match_url = Q(strains__registry_url__in=url_values)
        return queryset.filter(match_uuid | match_url)

    def group_replicates(self, queryset, name, value):
        if self.truthy(value):
            replicate_type = models.MetadataType.system("Replicate")
            # extract replicate key from metadata
            replicate = Func(
                F("metadata"),
                Value(f"{replicate_type.id}"),
                function="jsonb_extract_path_text",
                output_field=CharField(),
            )
            # define fallback of line's UUID when no metadata replicate value
            replicate_key = Coalesce(replicate, Cast("uuid", output_field=CharField()))
            return queryset.annotate(replicate_key=replicate_key)
        return queryset


class AssayFilter(EDDObjectFilter):
    experimenter = django_filters.ModelChoiceFilter(
        field_name="experimenter",
        help_text=_("ID of the user set as the Assay experimenter"),
        queryset=User.objects.all(),
    )
    in_study = django_filters.CharFilter(
        field_name="study",
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method=filter_in_study,
    )

    class Meta:
        model = models.Assay
        fields = {
            "line": ["exact", "in"],
            "protocol": ["exact", "in"],
        }


class MeasurementFilter(filters.FilterSet):
    active = django_filters.BooleanFilter(
        field_name="active",
        help_text=_(
            "Filter on currently active/visible items (True/1/yes or false/0/no)"
        ),
    )
    assay = django_filters.ModelChoiceFilter(
        field_name="assay",
        help_text=_("ID of an assay to limit measurements"),
        queryset=models.Assay.objects.all(),
    )
    created_before = django_filters.IsoDateTimeFilter(
        field_name="created__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="lte",
    )
    created_after = django_filters.IsoDateTimeFilter(
        field_name="created__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="gte",
    )
    compartment = django_filters.ChoiceFilter(
        choices=models.Measurement.Compartment.CHOICE,
        field_name="compartment",
        help_text=_(
            "One of the compartment codes, 0, 1, 2 for N/A, Intracellular, Extracellular"
        ),
    )
    in_study = django_filters.CharFilter(
        field_name="study",
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method=filter_in_study,
    )
    line = django_filters.ModelChoiceFilter(
        field_name="assay__line",
        help_text=_("ID of a line to limit measurements"),
        queryset=models.Line.objects.all(),
    )
    measurement_format = django_filters.ChoiceFilter(
        choices=models.Measurement.Format.CHOICE,
        field_name="measurement_format",
        help_text=_(
            "One of the format codes; currently only '0' for Scalar "
            "format values is supported"
        ),
    )

    class Meta:
        model = models.Measurement
        fields = {
            "measurement_type": ["exact", "in"],
            "x_units": ["exact", "in"],
            "y_units": ["exact", "in"],
        }


export_via_lookup = {
    models.Study: None,
    models.Line: ("study",),
    models.Assay: ("line", "study"),
    models.Measurement: ("study",),
}


def export_queryset(model):
    """Creates a queryset factory applying Study permissions."""
    via = export_via_lookup.get(model, None)

    def queryset(request):
        user = request.user if request else None
        qs = model.objects.distinct().filter(active=True)
        if models.Study.user_role_can_read(user):
            # no need to do special permission checking if role automatically can read
            return qs
        access = models.Study.access_filter(user, via=via)
        qs = qs.filter(access)
        return qs

    return queryset


class ExportFilter(filters.FilterSet):
    """
    FilterSet used to select data for exporting.
    See <main.export.table.ExportSelection>.
    """

    in_study = django_filters.CharFilter(
        field_name="study",
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method=filter_in_study,
    )
    study_id = django_filters.ModelMultipleChoiceFilter(
        field_name="study",
        help_text=_("List of ID values, separated by commas, for studies to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Study),
    )
    line_id = django_filters.ModelMultipleChoiceFilter(
        field_name="measurement__assay__line",
        help_text=_("List of ID values, separated by commas, for lines to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Line),
    )
    assay_id = django_filters.ModelMultipleChoiceFilter(
        field_name="measurement__assay",
        help_text=_("List of ID values, separated by commas, for assays to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Assay),
    )
    measure_id = django_filters.ModelMultipleChoiceFilter(
        field_name="measurement_id",
        help_text=_(
            "List of ID values, separated by commas, for measurements to export"
        ),
        lookup_expr="in",
        queryset=export_queryset(models.Measurement),
    )

    class Meta:
        model = models.MeasurementValue
        fields = []

    def filter_queryset(self, queryset):
        queryset = self._filter_ids_and_in_study(queryset)
        queryset = self._add_formal_type_ids(queryset)
        return queryset

    def _add_formal_type_ids(self, qs):
        # define the integer pubchem_cid field as CharField
        cast = Cast(
            "measurement__measurement_type__metabolite__pubchem_cid",
            output_field=CharField(),
        )
        prefix = Value("cid:", output_field=CharField())
        # instruct database to give PubChem ID in the cid:N format, or None
        qs = qs.annotate(anno_pubchem=NullIf(Concat(prefix, cast), prefix))
        # grab formal type IDs if able, otherwise empty string
        qs = qs.annotate(
            anno_formal_type=Coalesce(
                "anno_pubchem",
                "measurement__measurement_type__proteinidentifier__accession_id",
                Value("", output_field=CharField()),
                output_field=CharField(),
            )
        )
        return qs

    def _compose_id_filters(self):
        # define filters for special handling
        names = ["study_id", "line_id", "assay_id", "measure_id"]
        # now do special handling to OR together the filters
        id_filter = Q()
        # create filter by OR together the ID fields
        for name in names:
            f = self.filters.get(name)
            value = self.form.cleaned_data.get(name)
            if value:
                id_filter |= Q(**{f"{f.field_name}__{f.lookup_expr}": value})
        return id_filter

    def _filter_ids_and_in_study(self, queryset):
        """
        Filters the queryset by doing an OR-query on the ID types, plus an
        AND-query on the in_study filter, if specified.
        """
        queryset = queryset.filter(self._compose_id_filters())
        in_study = self.form.cleaned_data.get("in_study", None)
        if in_study:
            queryset = self.filters["in_study"].filter(queryset, in_study)
        return queryset


class ExportLineFilter(ExportFilter):
    """
    FilterSet used to select lines used in an Export, for reporting.
    See <main.export.table.ExportSelection>.
    """

    # overriding to lookup based on Line instead of MeasurementValue
    line_id = django_filters.ModelMultipleChoiceFilter(
        field_name="id",
        help_text=_("List of ID values, separated by commas, for lines to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Line),
    )
    # overriding to lookup based on Line instead of MeasurementValue
    assay_id = django_filters.ModelMultipleChoiceFilter(
        field_name="assay",
        help_text=_("List of ID values, separated by commas, for assays to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Assay),
    )
    # overriding to lookup based on Line instead of MeasurementValue
    measure_id = django_filters.ModelMultipleChoiceFilter(
        field_name="assay__measurement",
        help_text=_(
            "List of ID values, separated by commas, for measurements to export"
        ),
        lookup_expr="in",
        queryset=export_queryset(models.Measurement),
    )

    class Meta:
        model = models.Line
        fields = []

    def filter_queryset(self, queryset):
        return self._filter_ids_and_in_study(queryset)


class MeasurementValueFilter(filters.FilterSet):
    assay = django_filters.ModelChoiceFilter(
        field_name="measurement__assay",
        help_text=_("ID of an assay to limit measurements"),
        queryset=models.Assay.objects.all(),
    )
    created_before = django_filters.IsoDateTimeFilter(
        field_name="updated__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="lte",
    )
    created_after = django_filters.IsoDateTimeFilter(
        field_name="updated__mod_time",
        help_text=_("Use an ISO-8601-like datetime: 2020-01-01 00:00:00"),
        lookup_expr="gte",
    )
    in_study = django_filters.CharFilter(
        field_name="study",
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method=filter_in_study,
    )
    line = django_filters.ModelChoiceFilter(
        field_name="measurement__assay__line",
        help_text=_("ID of a line to limit measurements"),
        queryset=models.Line.objects.all(),
    )
    x__gt = django_filters.NumberFilter(field_name="x", lookup_expr="0__gte")
    x__lt = django_filters.NumberFilter(field_name="x", lookup_expr="0__lte")
    y__gt = django_filters.NumberFilter(field_name="y", lookup_expr="0__gte")
    y__lt = django_filters.NumberFilter(field_name="y", lookup_expr="0__lte")

    class Meta:
        model = models.MeasurementValue
        fields = {"measurement": ["exact", "in"]}


class MeasurementTypesFilter(filters.FilterSet):
    type_name = django_filters.CharFilter(
        field_name="type_name",
        help_text=_("Runs a regular expression search on the measurement type name"),
        lookup_expr="iregex",
    )
    type_group = django_filters.ChoiceFilter(
        choices=models.MeasurementType.Group.GROUP_CHOICE,
        field_name="type_group",
        help_text=_("One of the measurement type codes: '_', 'm', 'g', 'p'"),
    )

    class Meta:
        model = models.MeasurementType
        fields = []


class MetadataTypesFilter(filters.FilterSet):
    for_context = django_filters.ChoiceFilter(
        choices=models.MetadataType.CONTEXT_SET,
        field_name="for_context",
        help_text=_(
            "Context for metadata, 'S' for metadata on a Study, "
            "'L' for metadata on a Line, 'A' for metadata on an Assay."
        ),
    )
    group = django_filters.CharFilter(
        field_name="group__group_name",
        help_text=_("Runs a regular expression search on the metadata type group name"),
        lookup_expr="iregex",
    )
    in_study = django_filters.CharFilter(
        help_text=_("An identifier for the study; can use ID, UUID, or Slug"),
        method="used_in_study",
    )

    class Meta:
        model = models.MetadataType
        fields = []

    def used_in_study(self, queryset, name, value):
        # lines and assays in the study
        lines = filter_in_study(models.Line.objects.all(), name, value)
        assays = filter_in_study(models.Assay.objects.all(), name, value)
        # define the keys used in metadata
        keys_field = Func(F("metadata"), function="jsonb_object_keys")
        # make sure the keys are integers
        keys = Cast(keys_field, IntegerField())
        # get the distinct keys used
        line_keys_qs = lines.values_list(keys, flat=True).distinct()
        assay_keys_qs = assays.values_list(keys, flat=True).distinct()
        # get all keys used in the study
        return queryset.filter(pk__in=line_keys_qs.union(assay_keys_qs))


class MeasurementUnitFilter(filters.FilterSet):
    unit_name = django_filters.CharFilter(field_name="unit_name", lookup_expr="iregex",)

    class Meta:
        model = models.MeasurementUnit
        fields = []


class ProtocolFilter(EDDObjectFilter):
    class Meta:
        model = models.Protocol
        fields = ["owned_by", "variant_of", "default_units"]


__all__ = [
    AssayFilter,
    EDDObjectFilter,
    ExportFilter,
    ExportLineFilter,
    LineFilter,
    MeasurementFilter,
    MeasurementTypesFilter,
    MeasurementUnitFilter,
    MeasurementValueFilter,
    MetadataTypesFilter,
    ProtocolFilter,
    StudyFilter,
]
