import math
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError

from edd import TestCase

from .. import models
from . import factory


class UserTests(TestCase):
    JSON_KEYS = [
        "description",
        "disabled",
        "email",
        "firstname",
        "groups",
        "id",
        "initials",
        "institution",
        "lastname",
        "name",
        "uid",
    ]
    SOLR_KEYS = [
        "date_joined",
        "email",
        "fullname",
        "group",
        "id",
        "initials",
        "institution",
        "is_active",
        "is_staff",
        "is_superuser",
        "last_login",
        "name",
        "username",
    ]

    # create test users
    @classmethod
    def setUpTestData(cls):
        cls.user1 = factory.UserFactory(
            email="jsmith@localhost", first_name="Jane", last_name="Smith"
        )
        cls.user2 = factory.UserFactory(
            email="jdoe@localhost", first_name="", last_name=""
        )
        cls.admin = factory.UserFactory(
            email="ssue@localhost",
            is_staff=True,
            is_superuser=True,
            first_name="Sally",
            last_name="Sue",
        )

    def test_monkey_patches(self):
        """ Checking the properties monkey-patched on to the User model. """
        # Asserts
        self.assertIsNotNone(self.user1.profile)
        self.assertEqual(self.user1.initials, "JS")
        self.assertEqual(self.user1.profile.initials, "JS")
        self.assertIsNone(self.user1.institution)
        self.assertEqual(len(self.user1.institutions), 0)
        self.assertIsNotNone(self.user2.profile)
        self.assertEqual(self.user2.initials, "")
        self.assertEqual(self.user2.profile.initials, "")
        # ensure keys exist in JSON and Solr dict repr
        user_json = self.user1.to_json()
        for key in self.JSON_KEYS:
            self.assertIn(key, user_json)
        user_solr = self.user1.to_solr_json()
        for key in self.SOLR_KEYS:
            self.assertIn(key, user_solr)

    def test_initial_permissions(self):
        """ Checking initial class-based permissions for normal vs admin user. """
        # Asserts
        self.assertFalse(self.user1.has_perm("main.change.protocol"))
        self.assertTrue(self.admin.has_perm("main.change.protocol"))


class StudyTests(TestCase):
    def test_with_no_permissions(self):
        """Ensure that a study without permissions cannot be read."""
        study = factory.StudyFactory()
        user = factory.UserFactory()
        assert not study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_read_permission(self):
        """Ensure that a study can be read by a user with read permissions."""
        study = factory.StudyFactory()
        user = factory.UserFactory()
        models.UserPermission.objects.create(
            study=study, permission_type=models.StudyPermission.READ, user=user
        )
        assert study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_write_permission(self):
        """Ensure that a study can be written by a user with write permissions."""
        study = factory.StudyFactory()
        user = factory.UserFactory()
        models.UserPermission.objects.create(
            study=study, permission_type=models.StudyPermission.WRITE, user=user
        )
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_admin(self):
        """Ensure that a study can be written by a superuser."""
        study = factory.StudyFactory()
        user = factory.UserFactory(is_superuser=True)
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_group_read_permission(self):
        study = factory.StudyFactory()
        user = factory.UserFactory()
        group = factory.GroupFactory()
        user.groups.add(group)
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.READ, group=group
        )
        assert study.user_can_read(user)
        assert not study.user_can_write(user)

    def test_with_group_write_permission(self):
        study = factory.StudyFactory()
        user = factory.UserFactory()
        group = factory.GroupFactory()
        user.groups.add(group)
        models.GroupPermission.objects.create(
            study=study, permission_type=models.StudyPermission.WRITE, group=group
        )
        assert study.user_can_read(user)
        assert study.user_can_write(user)

    def test_with_multiple_groups(self):
        study = factory.StudyFactory()
        user = factory.UserFactory()
        group1 = factory.GroupFactory()
        group2 = factory.GroupFactory()
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
