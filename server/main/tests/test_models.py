import math
import warnings
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError

from edd import TestCase
from edd.profile.factory import GroupFactory, UserFactory
from edd.utilities import JSONEncoder

from .. import models
from ..utilities import flatten_json
from . import factory


class StudyTests(TestCase):
    def test_with_no_permissions(self):
        """Ensure that a study without permissions cannot be read."""
        study = factory.StudyFactory()
        user = UserFactory()
        assert not study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_read_permission(self):
        """Ensure that a study can be read by a user with read permissions."""
        study = factory.StudyFactory()
        user = UserFactory()
        models.UserPermission.objects.create(
            study=study, permission_type=models.StudyPermission.READ, user=user
        )
        assert study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_write_permission(self):
        """Ensure that a study can be written by a user with write permissions."""
        study = factory.StudyFactory()
        user = UserFactory()
        models.UserPermission.objects.create(
            study=study, permission_type=models.StudyPermission.WRITE, user=user
        )
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_admin(self):
        """Ensure that a study can be written by a superuser."""
        study = factory.StudyFactory()
        user = UserFactory(is_superuser=True)
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_group_read_permission(self):
        study = factory.StudyFactory()
        user = UserFactory()
        group = GroupFactory()
        user.groups.add(group)
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.READ, group=group
        )
        assert study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_group_write_permission(self):
        study = factory.StudyFactory()
        user = UserFactory()
        group = GroupFactory()
        user.groups.add(group)
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.WRITE, group=group
        )
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_multiple_groups(self):
        study = factory.StudyFactory()
        user = UserFactory()
        group1 = GroupFactory()
        group2 = GroupFactory()
        user.groups.add(group1)
        user.groups.add(group2)
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.READ, group=group1
        )
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.WRITE, group=group2
        )
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_add_study_metadata(self):
        study = factory.StudyFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.STUDY)
        value = factory.fake.pystr()
        study.metadata_add(md, value)
        assert study.metadata_get(md) == value

    def test_add_line_metadata_fails(self):
        study = factory.StudyFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        value = factory.fake.pystr()
        with pytest.raises(ValueError):
            study.metadata_add(md, value)
        assert study.metadata_get(md) is None

    def test_add_assay_metadata_fails(self):
        study = factory.StudyFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.ASSAY)
        value = factory.fake.pystr()
        with pytest.raises(ValueError):
            study.metadata_add(md, value)
        assert study.metadata_get(md) is None


class LineTests(TestCase):
    def test_add_study_metadata_fails(self):
        line = factory.LineFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.STUDY)
        value = factory.fake.pystr()
        with pytest.raises(ValueError):
            line.metadata_add(md, value)
        assert line.metadata_get(md) is None

    def test_add_line_metadata(self):
        line = factory.LineFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        value = factory.fake.pystr()
        line.metadata_add(md, value)
        assert line.metadata_get(md) == value

    def test_add_assay_metadata_fails(self):
        line = factory.LineFactory()
        md = factory.MetadataTypeFactory(for_context=models.MetadataType.ASSAY)
        value = factory.fake.pystr()
        with pytest.raises(ValueError):
            line.metadata_add(md, value)
        assert line.metadata_get(md) is None


class AssayDataTests(TestCase):
    def test_protocol_requires_name(self):
        with pytest.raises(ValueError):
            factory.ProtocolFactory(name="")

    def test_assay_numbering(self):
        a = factory.AssayFactory()
        assert a.line.new_assay_number(a.protocol) == 2

    def test_measurement_extract(self):
        m = factory.MeasurementFactory()
        x1, y1 = self._set_sample_values(m)
        assert m.extract_data_xvalues() == (x1 + [32])
        assert m.extract_data_xvalues(defined_only=True) == x1

    def test_measurement_interpolate_inside(self):
        m = factory.MeasurementFactory()
        self._set_sample_values(m)
        # interpolation inside domain gives value
        y_interp = m.interpolate_at(21)
        assert math.isclose(y_interp, 1.2)

    def test_measurement_interpolate_outside(self):
        m = factory.MeasurementFactory()
        self._set_sample_values(m)
        # interpolation outside domain is undefined/None
        assert m.interpolate_at(25) is None

    def test_measurement_interpolate_no_data(self):
        m = factory.MeasurementFactory()
        # interpolation with no data raises exception
        with self.assertRaises(ValueError):
            m.interpolate_at(20)

    def _set_sample_values(self, measurement):
        x1 = [0, 4, 8, 12, 18, 24]
        y1 = [0.0, 0.1, 0.2, 0.4, 0.8, 1.6]
        for x, y in zip(x1, y1):
            factory.ValueFactory(measurement=measurement, x=[x], y=[y])
        factory.ValueFactory(measurement=measurement, x=[32])
        return x1, y1


class MetaboliteTests(TestCase):
    def test_carbon_count_H2O(self):
        # a formula string without any carbons should return 0
        m1 = factory.MetaboliteFactory.build(molecular_formula="H2O")
        self.assertEqual(m1.extract_carbon_count(), 0)

    def test_carbon_count_CH4(self):
        # a formula string with a single carbon should return 1
        m2 = factory.MetaboliteFactory.build(molecular_formula="CH4")
        self.assertEqual(m2.extract_carbon_count(), 1)

    def test_carbon_count_CuO4S(self):
        # a formula string with a C that is not carbon should not count it as carbon
        m3 = factory.MetaboliteFactory.build(molecular_formula="CuO4S")
        self.assertEqual(m3.extract_carbon_count(), 0)

    def test_carbon_count_C6H12O6(self):
        # a formula string with a subscripted carbon should return the subscript count
        m4 = factory.MetaboliteFactory.build(molecular_formula="C6H12O6")
        self.assertEqual(m4.extract_carbon_count(), 6)

    def test_pubchem_load_bad_format(self):
        # create a metabolite with a CID
        m = factory.MetaboliteFactory(pubchem_cid=factory.factory.Faker("pyint"))
        cid = m.pubchem_cid
        # not in the CID:00000 format raises an error
        with self.assertRaises(ValidationError):
            models.Metabolite.load_or_create(f"{cid}")

    def test_pubchem_load_existing(self):
        # create a metabolite with a CID
        m = factory.MetaboliteFactory(pubchem_cid=factory.factory.Faker("pyint"))
        cid = m.pubchem_cid
        # lookup with the CID:00000 format succeeds, without creating
        with patch("main.models.measurement_type.transaction") as patched:
            found = models.Metabolite.load_or_create(f"CID:{cid}")
        patched.on_commit.assert_not_called()
        assert m.id == found.id

    def test_pubchem_create(self):
        # patch to verify on_commit hook to run task checking PubChem
        with patch("main.models.measurement_type.transaction") as patched:
            created = models.Metabolite.load_or_create("CID:9999")
        patched.on_commit.assert_called_once()
        # verify provisional type
        assert created.provisional
        assert created.pubchem_cid == "9999"


@pytest.fixture(scope="module")
def study_metadata():
    meta = factory.MetadataTypeFactory.build(for_context=models.MetadataType.STUDY)
    # fake setting a primary key; avoiding database use
    meta.pk = factory.fake.pyint()
    return meta


@pytest.fixture(scope="module")
def study_field_metadata():
    field = factory.fake.word()
    meta = factory.MetadataTypeFactory.build(
        for_context=models.MetadataType.STUDY, type_field=field
    )
    # fake setting a primary key; avoiding database use
    meta.pk = factory.fake.pyint()
    return meta


def test_deprecation_models_SYSTEM_META_TYPES():
    # test deprecation when reading from main.models
    with warnings.catch_warnings(record=True) as w:
        models.SYSTEM_META_TYPES.get("something", None)
    assert len(w) == 1
    assert issubclass(w[0].category, DeprecationWarning)


def test_deprecation_metadata_SYSTEM_META_TYPES():
    # test deprecation when reading from main.models.metadata
    with warnings.catch_warnings(record=True) as w:
        from main.models.metadata import SYSTEM_META_TYPES

        SYSTEM_META_TYPES.get("something", None)
    assert len(w) == 1
    assert issubclass(w[0].category, DeprecationWarning)


def test_MetadataType_system_lookup(db):
    # verify that an existing system type gets returned
    md = models.MetadataType.system("Time")
    assert md.for_context == models.MetadataType.ASSAY
    assert md.type_name == "Time"


def test_MetadataType_system_unknown_type(db):
    # verify that a not-existing system type yields exception
    with pytest.raises(models.MetadataType.DoesNotExist):
        models.MetadataType.system("this does not exist")


def test_MetadataType_for_assay():
    md = factory.MetadataTypeFactory.build(for_context=models.MetadataType.ASSAY)
    assert md.for_assay()
    assert not md.for_line()
    assert not md.for_study()


def test_MetadataType_for_line():
    md = factory.MetadataTypeFactory.build(for_context=models.MetadataType.LINE)
    assert md.for_line()
    assert not md.for_assay()
    assert not md.for_study()


def test_MetadataType_for_study():
    md = factory.MetadataTypeFactory.build(for_context=models.MetadataType.STUDY)
    assert md.for_study()
    assert not md.for_assay()
    assert not md.for_line()


def test_MetadataType_str_works():
    # casting to a string does reasonable stuff
    md = factory.MetadataTypeFactory.build()
    string = str(md)
    assert string == md.type_name


def test_MetadataType_to_json_works():
    # using to_json method makes something that can serialize to JSON
    md = factory.MetadataTypeFactory.build()
    result = JSONEncoder.dumps(md.to_json())
    assert md.type_name in result


def test_EDDMetadata_allow_metadata():
    # the base mixin for objects with metadata will always return False
    # implementing classes are responsible for setting allowlist
    obj = models.EDDObject()
    md = factory.MetadataTypeFactory.build()
    assert not obj.allow_metadata(md)
    assert not obj.allow_metadata(None)


def test_EDDMetadata_metadata_get_from_empty(study_metadata):
    obj = factory.StudyFactory.build()
    assert obj.metadata_get(study_metadata) is None


def test_EDDMetadata_metadata_get_from_empty_with_default(study_metadata):
    obj = factory.StudyFactory.build()
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) is sentinel


def test_EDDMetadata_metadata_get_type_field(study_field_metadata):
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    value = factory.fake.word()
    setattr(obj, field, value)
    assert obj.metadata_get(study_field_metadata) == value


def test_EDDMetadata_metadata_add_not_allowed():
    # adding metadata meant for Line objects to a Study raises a ValueError
    obj = factory.StudyFactory.build()
    md = factory.MetadataTypeFactory.build(for_context=models.MetadataType.LINE)
    with pytest.raises(ValueError):
        obj.metadata_add(md, "this value does not matter")


def test_EDDMetadata_metadata_add_from_empty(study_metadata):
    # first add sets value,
    # second add sees previous and makes list
    # third add sees previous is list and appends
    obj = factory.StudyFactory.build()
    value1 = factory.fake.word()
    value2 = factory.fake.word()
    value3 = factory.fake.word()
    obj.metadata_add(study_metadata, value1)
    obj.metadata_add(study_metadata, value2)
    obj.metadata_add(study_metadata, value3)
    assert obj.metadata_get(study_metadata) == [value1, value2, value3]


def test_EDDMetadata_metadata_add_twice_no_append(study_metadata):
    # when append=False, adding does a replace instead of append
    obj = factory.StudyFactory.build()
    value1 = factory.fake.word()
    value2 = factory.fake.word()
    obj.metadata_add(study_metadata, value1, append=False)
    obj.metadata_add(study_metadata, value2, append=False)
    assert obj.metadata_get(study_metadata) == value2


def test_EDDMetadata_metadata_add_type_field(study_field_metadata):
    # adding metadata for a type_field
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    oldvalue = factory.fake.word()
    newvalue = factory.fake.word()
    setattr(obj, field, oldvalue)
    obj.metadata_add(study_field_metadata, newvalue)
    assert getattr(obj, field) == newvalue


def test_EDDMetadata_metadata_add_type_field_set(study_field_metadata):
    # adding metadata for a type_field having an add() method
    # a set is a proxy for RelatedManager for a reverse foreign key
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    value = factory.fake.word()
    setattr(obj, field, set())
    obj.metadata_add(study_field_metadata, value)
    assert value in getattr(obj, field)


def test_EDDMetadata_metadata_add_type_field_set_no_append(study_field_metadata):
    # adding metadata for a type_field having an add() method
    # a set is a proxy for RelatedManager for a reverse foreign key
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    oldvalue = factory.fake.word()
    newvalue = factory.fake.word()
    setattr(obj, field, {oldvalue})
    obj.metadata_add(study_field_metadata, newvalue, append=False)
    assert oldvalue not in getattr(obj, field)
    assert newvalue in getattr(obj, field)


def test_EDDMetadata_metadata_clear_from_empty(study_metadata):
    # clearing something that isn't set is fine
    obj = factory.StudyFactory.build(metadata={})
    obj.metadata_clear(study_metadata)
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) is sentinel


def test_EDDMetadata_metadata_clear(study_metadata):
    # setting then clearing metadata
    obj = factory.StudyFactory.build(metadata={})
    value = factory.fake.word()
    obj.metadata_add(study_metadata, value)
    assert obj.metadata_get(study_metadata) == value
    obj.metadata_clear(study_metadata)
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) is sentinel


def test_EDDMetadata_metadata_clear_type_field(study_field_metadata):
    # clearing metadata tied to a field
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    value = factory.fake.word()
    setattr(obj, field, value)
    obj.metadata_clear(study_field_metadata)
    assert getattr(obj, field) is None


def test_EDDMetadata_metadata_clear_type_field_set(study_field_metadata):
    # clearing metadata tied to a field
    # a set is a proxy for RelatedManager for a reverse foreign key
    obj = factory.StudyFactory.build()
    field = study_field_metadata.type_field
    value = factory.fake.word()
    setattr(obj, field, {value})
    obj.metadata_clear(study_field_metadata)
    assert value not in getattr(obj, field)


def test_EDDMetadata_metadata_remove_unset(study_metadata):
    # removing something that was never set is OK
    obj = factory.StudyFactory.build()
    obj.metadata_remove(study_metadata, "value does not matter")
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) is sentinel


def test_EDDMetadata_metadata_remove_value(study_metadata):
    # removing something after setting it works OK
    obj = factory.StudyFactory.build()
    value = factory.fake.word()
    obj.metadata_add(study_metadata, value)
    obj.metadata_remove(study_metadata, value)
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) is sentinel


def test_EDDMetadata_metadata_remove_mismatch_value(study_metadata):
    # removing something after setting it works OK
    obj = factory.StudyFactory.build()
    value = factory.fake.word()
    obj.metadata_add(study_metadata, value)
    obj.metadata_remove(study_metadata, "value does not matter")
    sentinel = object()
    assert obj.metadata_get(study_metadata, default=sentinel) == value


def test_EDDMetadata_metadata_remove_matched_item(study_metadata):
    # removing something after setting it works OK
    obj = factory.StudyFactory.build()
    value1 = factory.fake.word()
    value2 = factory.fake.word()
    obj.metadata_add(study_metadata, value1)
    obj.metadata_add(study_metadata, value2)
    obj.metadata_remove(study_metadata, value1)
    assert obj.metadata_get(study_metadata) == [value2]


def test_EDDMetadata_metadata_remove_unmatched_item(study_metadata):
    # removing something after setting it works OK
    obj = factory.StudyFactory.build()
    value1 = factory.fake.word()
    value2 = factory.fake.word()
    obj.metadata_add(study_metadata, value1)
    obj.metadata_add(study_metadata, value2)
    obj.metadata_remove(study_metadata, "value does not matter")
    assert obj.metadata_get(study_metadata) == [value1, value2]


def test_Worklist_flatten_json_empty_dict():
    result = flatten_json({})
    assert result == {}
    # verify that results won't throw KeyError when %-formatting strings
    assert "%(invalid)s" % result == ""


def test_Worklist_flatten_json_list():
    result = flatten_json(["Hello", "world"])
    assert result == {"0": "Hello", "1": "world"}


def test_Worklist_flatten_json_nested_list():
    result = flatten_json({"message": ["Hello", "world"]})
    assert result == {"message.0": "Hello", "message.1": "world"}


def test_Worklist_flatten_json_nested_dict():
    color = factory.fake.color()
    result = flatten_json({"user": {"profile": {"favorite_color": color}}})
    assert result == {"user.profile.favorite_color": color}


def test_Worklist_flatten_json_numeric_value():
    number = factory.fake.pyint()
    result = flatten_json({"user_count": number})
    assert result == {"user_count": number}
