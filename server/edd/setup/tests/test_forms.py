import pytest

from main import models as edd_models
from main.tests.factory import ProtocolFactory, StrainFactory

from ..exceptions import SetupException
from ..forms import ResolveTokensForm


def test_form_create_without_post_data(writable_session):
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        form = ResolveTokensForm(setup_request=setup)

    # fixture has three unknown metadata columns,
    # each get a metadata field, plus an ignore-all field
    assert len(form.fields) == 4


def test_form_create_with_irrelevant_data(writable_session):
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        # create form payload that will not match fields for form setup
        payload = {
            "foobar": "Hello, world!",
            "names": ["alvin", "simon", "theodore"],
            # specifically include payload that will have problems with codec
            "a💥": "😀",
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)

        # initially, no fields will be created
        assert len(form.fields) == 0
        # form will not validate
        assert not form.is_valid()
        with pytest.raises(SetupException):
            form.get_resolver()
        # fixture fields will be created, to display fallback form
        # inside context manager, as `setup` needs to still exist
        assert len(form.fields) == 4


def test_form_resolver_with_all_metadata_ignored(writable_session):
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        # name "Zm9ybTptZXRh" translates to boolean field for ignoring all metadata
        payload = {"Zm9ybTptZXRh": 1}
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # each unmatched metadata column from file is ignored in resolver
    assert resolver.is_meta_ignored("World")
    assert resolver.is_meta_ignored("House")
    assert resolver.is_meta_ignored("Spice")
    # completely unknown metadata will also be ignored
    assert resolver.is_meta_ignored("foobar")


def test_form_resolver_with_some_metadata_ignored(writable_session):
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        payload = {
            # name "bWV0YTpIb3VzZQ" translates to field for "House"
            "bWV0YTpIb3VzZQ": '{"ignore":1}',
            # name "bWV0YTpXb3JsZA" translates to field for "World"
            "bWV0YTpXb3JsZA": "{}",
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # specified column ignored
    assert resolver.is_meta_ignored("House")
    assert resolver.metatype_from_name("House") is None
    # other columns NOT ignored
    assert not resolver.is_meta_ignored("World")
    assert not resolver.is_meta_ignored("Spice")
    # completely unknown metadata NOT ignored
    assert not resolver.is_meta_ignored("foobar")


def test_form_resolver_with_metadata_options(writable_session):
    media = edd_models.MetadataType.system("Media")
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        payload = {
            # name "bWV0YTpIb3VzZQ" translates to field for "House"
            "bWV0YTpIb3VzZQ": '{"new":1}',
            # name "bWV0YTpXb3JsZA" translates to field for "World"
            "bWV0YTpXb3JsZA": media.pk,
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # new metadata type made for "House"
    house = resolver.metatype_from_name("House")
    assert house is not None
    # existing metadata type used for "World"
    world = resolver.metatype_from_name("World")
    assert world.pk == media.pk
    # other columns get no mapping
    spice = resolver.metatype_from_name("Spice")
    assert spice is None
    # verify behavior of UUID lookups
    good = resolver.metatype_from_uuid(media.uuid)
    assert good.pk == media.pk
    bad = resolver.metatype_from_uuid("invalid-uuid")
    assert bad is None


def test_form_resolver_with_all_strains_ignored(writable_session):
    filename = writable_session.path("strain.csv")
    with writable_session.setup(upload_file=filename) as setup:
        # name "Zm9ybTpzdHJhaW4" translates to boolean field for ignoring all strains
        payload = {"Zm9ybTpzdHJhaW4": 1}
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # each unmatched strain ID from file is ignored in resolver
    assert resolver.is_strain_ignored("JBx_00001")
    assert resolver.is_strain_ignored("JBx_00002")
    assert resolver.is_strain_ignored("JBx_00003")
    assert resolver.is_strain_ignored("JBx_00004")
    # completely unknown strain ID will also be ignored
    assert resolver.is_strain_ignored("foobar")


def test_form_resolver_with_strain_options(db, writable_session):
    existing_strain = StrainFactory()
    filename = writable_session.path("strain.csv")
    with writable_session.setup(upload_file=filename) as setup:
        payload = {
            # name "c3RyYWluOkpCeF8wMDAwMQ" translates to strain ID JBx_00001
            "c3RyYWluOkpCeF8wMDAwMQ": [existing_strain.registry_id],
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # JBx_00001 is mapped to existing_strain
    assert not resolver.is_strain_ignored("JBx_00001")
    matched = list(resolver.strains_from_name("JBx_00001"))
    assert len(matched) == 1
    # coerce UUIDs to strings for comparison
    assert str(matched[0].registry_id) == str(existing_strain.registry_id)
    # unknown strain is not mapped
    assert not resolver.is_strain_ignored("unknown")
    matched = list(resolver.strains_from_name("unknown"))
    assert len(matched) == 0


def test_form_resolver_with_protocol_options(writable_session):
    existing = ProtocolFactory()
    filename = writable_session.path("unmatched.csv")
    with writable_session.setup(upload_file=filename) as setup:
        payload = {
            # name "cHJvdG9jb2w6SG91c2U" translates to protocol field for "House"
            "cHJvdG9jb2w6SG91c2U": '{"new":1}',
            # name "cHJvdG9jb2w6V29ybGQ" translates to protocol field for "World"
            "cHJvdG9jb2w6V29ybGQ": existing.pk,
            # name "cHJvdG9jb2w6U3BpY2U" translates to protocol field for "Spice"
            "cHJvdG9jb2w6U3BpY2U": "{}",
        }
        form = ResolveTokensForm(setup_request=setup, data=payload)
        resolver = form.get_resolver()

    # new protocol for "House"
    house = resolver.protocol_id_from_name("House")
    assert house is not None
    assert house != existing.pk
    # existing protocol for "World"
    world = resolver.protocol_id_from_name("World")
    assert str(world) == str(existing.uuid)
    # no mapping for "Spice"
    spice = resolver.protocol_id_from_name("Spice")
    assert spice is None
    # no mapping for unknown items
    unknown = resolver.protocol_id_from_name("unknown")
    assert unknown is None
