import base64
import functools
import logging
import typing
from collections.abc import Iterable

from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from edd.search import widgets as autocomplete
from edd.search.registry import StrainRegistry
from main import models as edd_models

from .exceptions import SetupException
from .parser import RecordResolver

if typing.TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

    from . import broker

    User: typing.TypeAlias = AbstractUser

logger = logging.getLogger(__name__)


def name_from_token(token: bytes) -> str:
    """
    Create valid form element name from token, stripping padding characters.
    """
    return base64.urlsafe_b64encode(token).strip(b"=").decode("utf8")


def split_token(token: bytes) -> tuple[str, str]:
    """
    Extract family type and unresolved value from an unresolved token.
    """
    try:
        parts = token.split(b":", 1)
        if len(parts) == 2:
            return parts[0].decode(), parts[1].decode()
    except Exception:
        pass
    # give empty values when no separator found
    return "", ""


def token_from_name(name: str) -> bytes | None:
    try:
        # get potential token by adding maximum padding characters and decoding
        return base64.urlsafe_b64decode(name.encode("utf8") + b"==")
    except Exception:
        return None


class FormResolver(RecordResolver):
    def __init__(self, form, user):
        self.form = form
        self.ice = StrainRegistry(user)

    def is_meta_ignored(self, name: str) -> bool:
        bulk_key = name_from_token(b"form:meta")
        if self.form.cleaned_data.get(bulk_key, False):
            return True
        name_key = name_from_token(f"meta:{name}".encode())
        if "ignore" in self.form.cleaned_data.get(name_key, {}):
            return True
        return False

    def is_strain_ignored(self, name: str) -> bool:
        bulk_key = name_from_token(b"form:strain")
        if self.form.cleaned_data.get(bulk_key, False):
            return True
        return False

    @functools.cache
    def metatype_from_name(self, name: str) -> edd_models.MetadataType | None:
        key = name_from_token(f"meta:{name}".encode())
        match value := self.form.cleaned_data.get(key, None):
            case int(pk):
                return edd_models.MetadataType.objects.get(pk=pk)
            case {"new": _}:
                return self._new_line_metadata(name)
            case None:
                # avoid excessive logging by ignoring None
                pass
            case _:
                logger.warning(f"Failed to match form value: {value}")
        return None

    @functools.cache
    def metatype_from_uuid(self, uuid: str) -> edd_models.MetadataType | None:
        # This is not something the form will resolve, so just do a direct lookup
        try:
            return edd_models.MetadataType.objects.get(uuid=uuid)
        except Exception:
            pass
        return None

    @functools.cache
    def protocol_id_from_name(self, name: str) -> str | None:
        key = name_from_token(f"protocol:{name}".encode())
        match value := self.form.cleaned_data.get(key, None):
            case int(pk):
                p = edd_models.Protocol.objects.get(pk=pk)
                return str(p.uuid)
            case {"new": _}:
                return self._new_protocol(name)
            case None:
                # avoid excessive logging by ignoring None
                pass
            case _:
                logger.warning(f"Failed to match form value: {value}")
        return None

    @functools.cache
    def strains_from_name(self, name: str) -> Iterable[edd_models.Strain]:
        key = name_from_token(f"strain:{name}".encode())
        yield from self.ice.clean_autocomplete_value(self.form.cleaned_data.get(key, None))

    def _new_line_metadata(self, metadata) -> edd_models.MetadataType:
        return edd_models.MetadataType.objects.create(
            for_context=edd_models.MetadataType.LINE,
            type_name=metadata,
        )

    def _new_protocol(self, protocol) -> str:
        obj = edd_models.Protocol.objects.create(name=protocol)
        return str(obj.uuid)


class ResolveTokensForm(forms.Form):
    """Form to resolve unmatched tokens in an Experiment Setup."""

    template_name = "edd/setup/forms/resolve.html"

    def __init__(
        self,
        setup_request: "broker.SetupRequest",
        user: "User",
        page: int | None = None,
        data=None,
        *args,
        **kwargs,
    ):
        super().__init__(data=data, *args, **kwargs)
        self.setup = setup_request
        self.user = user
        self.page = page or 1
        if data:
            self._setup_from_data(data)
        else:
            self._setup_from_page()

    def clean(self):
        super().clean()
        if not self.fields:
            # cannot re-create form from submitted data; so build from page
            self._setup_from_page()
            # raise validation error for the entire form
            message = _("Could not process submitted form information. Please contact support.")
            raise ValidationError(message)

    def get_resolver(self) -> FormResolver:
        if self.is_valid():
            return FormResolver(self, self.user)
        raise SetupException(f"Token form is invalid: {self.errors}")

    @functools.cached_property
    def page_next(self) -> int | None:
        if self.page_size * self.page < self.setup.request.tokens_length():
            return self.page + 1
        return None

    @functools.cached_property
    def page_previous(self) -> int | None:
        if self.page > 1:
            return self.page - 1
        return None

    @functools.cached_property
    def page_size(self):
        # this could be a per-user setting, instead of global
        return getattr(settings, "EDD_WIZARD_TOKENS_PER_PAGE", 20)

    @property
    def raw_tokens(self):
        self.is_valid()
        data = self.cleaned_data or {}
        return filter(bool, (token_from_name(n) for n in data.keys()))

    def _add_field(self, name, token):
        match split_token(token):
            case ("form", "meta"):
                self.fields[name] = self._create_ignore_metadata_field()
            case ("form", "strain"):
                self.fields[name] = self._create_ignore_strain_field()
            case ("meta", value):
                self.fields[name] = self._create_metadata_field(value)
                # TODO: find a way to hide a pre-emptively created protocol field
                #   ... so that it can be revealed IFF user selects an assay metadata
                # pname = name_from_token(f"protocol:{value}".encode())
                # self.fields[pname] = self._create_protocol_field(value)
            case ("protocol", value):
                self.fields[name] = self._create_protocol_field(value)
            case ("strain", value):
                self.fields[name] = self._create_strain_field(value)
            case _:
                logger.warning(f"Unknown field from {name}:{token}")

    def _create_ignore_metadata_field(self):
        help_text = _(
            "Continue with Experiment Setup by ignoring columns not matched to "
            "EDD metadata types."
        )
        return forms.BooleanField(
            help_text=help_text,
            label=_("Ignore unmatched metadata columns"),
            required=False,
        )

    def _create_ignore_strain_field(self):
        help_text = _(
            "Continue with Experiment Setup by dropping strain values without "
            "an external Strain registry reference."
        )
        return forms.BooleanField(
            help_text=help_text,
            label=_("Ignore unmatched strain values"),
            required=False,
        )

    def _create_metadata_field(self, value):
        help_text = _("Choose a metadata type to match {token}").format(token=value)
        return forms.JSONField(
            help_text=help_text,
            label=value,
            required=False,
            widget=autocomplete.MetadataAutocomplete(),
        )

    def _create_protocol_field(self, value):
        help_text = _("Choose a Protocol for Assays using metadata {token}").format(
            token=value,
        )
        label = _("Protocol for {token}").format(token=value)
        return forms.JSONField(
            help_text=help_text,
            label=label,
            required=False,
            widget=autocomplete.ProtocolAutocomplete(),
        )

    def _create_strain_field(self, value):
        registry = self._get_strain_registry()
        if registry.is_configured():
            help_text = _("Choose a Strain to match {token}").format(token=value)
            return forms.JSONField(
                help_text=help_text,
                label=value,
                required=False,
                widget=autocomplete.RegistryAutocomplete(),
            )
        return forms.JSONField(
            disabled=True,
            help_text=autocomplete.RegistryAutocomplete.help_text(),
            label=value,
            required=False,
            widget=autocomplete.RegistryAutocomplete(),
        )

    @functools.cache
    def _get_strain_registry(self):
        return StrainRegistry(self.user)

    def _setup_from_data(self, data):
        for possible_name in data:
            token = token_from_name(possible_name)
            self._add_field(possible_name, token)

    def _setup_from_page(self):
        start, end = self._token_range()
        for token in self.setup.get_unresolved_tokens_range(start, end):
            name = name_from_token(token)
            self._add_field(name, token)

    def _token_range(self):
        index = self.page - 1
        start = index * self.page_size
        end = start + self.page_size
        return start, end
