import base64
import decimal
import functools
import logging

from django import forms
from django.utils.translation import gettext_lazy as _

from edd.search import widgets as autocomplete
from main import models as edd_models

from . import broker, layout, lookup

logger = logging.getLogger(__name__)


class StartLoadForm(forms.Form):
    """Form to create a new Load pipeline."""

    template_name = "edd/load/forms/start.html"

    # primary fields
    protocol = forms.ModelChoiceField(
        empty_label=_("Choose a Protocol"),
        help_text="",
        label=_("Protocol"),
        queryset=edd_models.Protocol.objects.order_by("name"),
        required=True,
        widget=autocomplete.ProtocolAutocomplete(),
    )
    layout = forms.ChoiceField(
        choices=layout.Layout.all_available(),
        label=_("Layout"),
        required=True,
        widget=autocomplete.Select2Widget(),
    )

    @classmethod
    def from_load_request(self, load_request: broker.LoadRequest):
        initial = {
            "protocol": load_request.protocol,
            "layout": load_request.layout_key,
        }
        return StartLoadForm(initial=initial)

    def start(self, study):
        lr = broker.LoadRequest(
            study_uuid=study.uuid,
            layout_key=self.cleaned_data["layout"],
            protocol_uuid=self.cleaned_data["protocol"].uuid,
        )
        lr.store()
        return lr


def name_from_token(token: bytes) -> str:
    """
    Create valid form element name from token, stripping padding characters.
    """
    return base64.urlsafe_b64encode(token).strip(b"=").decode("utf8")


def split_token(token: bytes) -> tuple[str, str]:
    """
    Extract family type and unresolved value from an unresolved token.
    """
    parts = token.split(b":", 1)
    if len(parts) == 2:
        return parts[0].decode(), parts[1].decode()
    # give empty values when no separator found
    return "", ""


def token_from_name(name: str) -> bytes:
    # skip invalid base64
    if len(name) % 4 == 1:
        return b""
    # get potential token by adding maximum padding characters and decoding
    return base64.urlsafe_b64decode(name.encode("utf8") + b"==")


class ResolveTokensForm(forms.Form):
    """Form to resolve unmatched tokens in a Load pipeline."""

    template_name = "edd/load/forms/resolve.html"

    def __init__(
        self,
        load_request: "broker.LoadRequest",
        start: int = None,
        end: int = None,
        data=None,
        *args,
        **kwargs,
    ):
        super().__init__(data=data, *args, **kwargs)
        self.protocol = load_request.protocol
        self.study = load_request.study
        # re-using for value lookup doesn't need a User set
        self.resolver = lookup.Resolver(load=load_request, user=None)
        if data:
            # when getting data, try to build fields directly from data,
            # as current unresolved tokens can change over time, and page
            # info may be out-of-date when the form is processed
            for possible_name in data:
                token = token_from_name(possible_name)
                self._add_field(load_request, possible_name, token)
        else:
            for token in load_request.unresolved_tokens(start, end):
                name = name_from_token(token)
                self._add_field(load_request, name, token)
        if not self.fields:
            raise ValueError(
                "ResolveTokensForm must either receive data or a LoadRequest; "
                "found no valid fields for the form."
            )

    def _add_field(self, load_request, name, token):
        family, value = split_token(token)
        if family == "locator":
            self.fields[name] = self._create_locator_field(value)
        elif family == "type":
            self.fields[name] = self._create_type_field(value)
        elif family == "unit":
            self.fields[name] = self._create_unit_field(value)
        elif family == "x":
            self.fields[name] = self._create_value_field()

    @functools.cache
    def locator_ids(self, locator: str) -> (int | None, int | None):
        name = name_from_token(f"locator:{locator}".encode())
        match value := self.cleaned_data.get(name, None):
            case {"type": "Assay", "id": assay_id}:
                return self._validate_assay(assay_id)
            case {"type": "Line", "id": line_id}:
                return self._validate_line(line_id, locator)
            case _:
                logger.warning(f"Failed to match locator {value}")
        return (None, None)

    @functools.cache
    def type_id(self, type_name: str) -> int | None:
        name = name_from_token(f"type:{type_name}".encode())
        match value := self.cleaned_data.get(name, None):
            case int(type_id):
                obj = edd_models.MeasurementType.objects.get(id=type_id)
                return obj.id
            case _:
                logger.warning(f"Failed to match type {value}")
        return None

    @functools.cache
    def unit_id(self, unit: str) -> int | None:
        name = name_from_token(f"unit:{unit}".encode())
        match value := self.cleaned_data.get(name, None):
            case int(unit_id):
                obj = edd_models.MeasurementUnit.objects.get(id=unit_id)
                return obj.id
            case {"new": _}:
                obj = edd_models.MeasurementUnit.objects.create(unit_name=unit)
                return obj.id
            case _:
                logger.warning(f"Failed to match unit {value}")
        return None

    def values(self, record: layout.Record) -> list[decimal.Decimal]:
        name = name_from_token(b"x:")
        # checking if locator -> assay has a "Time" metadata as default x-value
        if values := self.resolver.values(record):
            return values
        # use any form submitted value as default x-value otherwise
        elif value := self.cleaned_data.get(name, None):
            return [decimal.Decimal(value)]
        return []

    @property
    def raw_tokens(self):
        data = self.cleaned_data or {}
        return filter(bool, (token_from_name(n) for n in data.keys()))

    def _create_locator_field(self, value):
        help_text = _("Choose a line or assay to match {token}").format(token=value)
        return forms.JSONField(
            help_text=help_text,
            label=value,
            required=False,
            widget=autocomplete.AssayLineAutocomplete(
                protocol_id=self.protocol.id,
                study_id=self.study.id,
            ),
        )

    def _create_type_field(self, value):
        help_text = _("Choose a measurement type to match {token}").format(token=value)
        return forms.JSONField(
            help_text=help_text,
            label=value,
            required=False,
            widget=autocomplete.MeasurementAutocomplete(),
        )

    def _create_unit_field(self, value):
        return forms.JSONField(
            help_text=_("Choose a unit to match {token}").format(token=value),
            label=value,
            required=False,
            widget=autocomplete.UnitAutocomplete(allow_create=True),
        )

    def _create_value_field(self):
        return forms.DecimalField(
            help_text=_("Enter a default X-value (time)"),
            label=_("X-value"),
            required=False,
            widget=forms.NumberInput(attrs={"class": "form-control"}),
        )

    def _validate_assay(self, assay_id):
        try:
            # verify these are on correct study
            assay = edd_models.Assay.objects.get(id=assay_id, study_id=self.study.id)
            return (assay.id, assay.line_id)
        except Exception as e:
            logger.warning(f"Failed to validate assay {assay_id}: {e}")
            return (None, None)

    def _validate_line(self, line_id, locator):
        try:
            # verify line on correct study, and create a new assay
            line = edd_models.Line.objects.get(id=line_id, study_id=self.study.id)
            assay = line.new_assay(locator, self.protocol)
            return (assay.id, line_id)
        except Exception as e:
            logger.warning(f"Failed to validate {line_id} for {locator}: {e}")
            return (None, None)
