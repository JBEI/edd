"""Defines filters for EDD's REST API."""

import logging
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import CharField, Q, Value
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


def try_uuid(value):
    try:
        return UUID(value)
    except ValueError:
        pass


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
        help_text=_("Filter on lines marked as controls (True/1/yes or false/0/no)"),
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
    strain = django_filters.CharFilter(
        field_name="strains",
        help_text=_("Search on a strain UUID or registry URLs, separated by commas"),
        method="filter_strains",
    )

    class Meta:
        model = models.Line
        fields = []

    def filter_strains(self, queryset, name, values):
        # split out multiple values similar to other django_filters 'in' param processing
        uuid_values, url_values = [], []
        for value in values.split(","):
            uuid_value = try_uuid(value)
            if uuid_value:
                uuid_values.append(uuid_value)
            else:
                url_values.append(value)
        match_uuid = Q(strains__registry_id__in=uuid_values)
        match_url = Q(strains__registry_url__in=url_values)
        return queryset.filter(match_uuid | match_url)


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

    @property
    def qs(self):
        if not hasattr(self, "_qs"):
            # define filters for special handling
            names = ["study_id", "line_id", "assay_id", "measure_id"]
            special = {name: self.filters.get(name, None) for name in names}
            fields = {name: f.field for name, f in special.items()}
            # create a custom form for the filters with special handling
            form = self._custom_form(fields)
            if not form.is_valid():
                return self.queryset.none()
            # now do special handling to OR together the filters
            id_filter = Q()
            for name, filter_ in special.items():
                if filter_ is not None:
                    # when a value is found, OR together with others
                    value = form.cleaned_data.get(name)
                    if value:
                        id_filter |= Q(
                            **{f"{filter_.field_name}__{filter_.lookup_expr}": value}
                        )
            self._qs = self.queryset.filter(
                id_filter,
                study__active=True,
                measurement__active=True,
                measurement__assay__active=True,
                measurement__assay__line__active=True,
            )
            # add in annotations to get formal type IDs
            self._qs = self._add_formal_type_ids(self._qs)
        # filter with the aggregated filter expression
        return self._qs

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

    def _custom_form(self, fields):
        # create a custom form for the filters with special handling
        Form = type(f"{self.__class__.__name__}IDForm", (self._meta.form,), fields)
        if self.is_bound:
            form = Form(self.data, prefix=self.form_prefix)
        else:
            form = Form(prefix=self.form_prefix)
        return form


class ExportLineFilter(filters.FilterSet):
    """
    FilterSet used to select lines used in an Export, for reporting.
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
        field_name="id",
        help_text=_("List of ID values, separated by commas, for lines to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Line),
    )
    assay_id = django_filters.ModelMultipleChoiceFilter(
        field_name="assay",
        help_text=_("List of ID values, separated by commas, for assays to export"),
        lookup_expr="in",
        queryset=export_queryset(models.Assay),
    )
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

    @property
    def qs(self):
        if not hasattr(self, "_qs"):
            # define filters for special handling
            names = ["study_id", "line_id", "assay_id", "measure_id"]
            special = {name: self.filters.get(name, None) for name in names}
            fields = {name: f.field for name, f in special.items()}
            # create a custom form for the filters with special handling
            form = self._custom_form(fields)
            if not form.is_valid():
                return self.queryset.none()
            # now do special handling to OR together the filters
            id_filter = Q()
            for name, filter_ in special.items():
                if filter_ is not None:
                    # when a value is found, OR together with others
                    value = form.cleaned_data.get(name)
                    if value:
                        id_filter |= Q(
                            **{f"{filter_.field_name}__{filter_.lookup_expr}": value}
                        )
            self._qs = self.queryset.filter(
                id_filter,
                active=True,
                study__active=True,
                assay__active=True,
                assay__measurement__active=True,
            )
        # filter with the aggregated filter expression
        return self._qs

    def _custom_form(self, fields):
        # create a custom form for the filters with special handling
        Form = type(f"{self.__class__.__name__}IDForm", (self._meta.form,), fields)
        if self.is_bound:
            form = Form(self.data, prefix=self.form_prefix)
        else:
            form = Form(prefix=self.form_prefix)
        return form


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

    class Meta:
        model = models.MetadataType
        fields = []


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
