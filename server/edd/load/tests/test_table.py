from django.core.exceptions import PermissionDenied
from django.test import RequestFactory

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from ..table import TableImport


class TableImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_kwargs = {"slug": cls.target_study.slug}

    def setUp(self):
        super().setUp()
        # fake a request so all calls to Update.load_update resolve to a singluar Update
        request = RequestFactory().get("/test-fixture")
        request.user = self.user

    def _set_permission(self, permission_type=models.StudyPermission.READ, user=None):
        # abstracting this repeating pattern for setting a permission
        user = self.user if user is None else user
        self.target_study.userpermission_set.update_or_create(
            permission_type=permission_type, user=user
        )

    def test_refuse_write_without_permission(self):
        # exception when no permissions set
        with self.assertRaises(PermissionDenied):
            TableImport(self.target_study, self.user)
        # set permission
        self._set_permission(permission_type=models.StudyPermission.WRITE)
        # now no exception raised
        try:
            TableImport(self.target_study, self.user)
        except PermissionDenied:
            self.fail()

    def test_simple_import(self):
        """Test an import where everything is already resolved."""
        line = factory.LineFactory(study=self.target_study)
        protocol = factory.ProtocolFactory()
        assay = factory.AssayFactory(line=line, protocol=protocol)
        mtype = factory.MetaboliteFactory()
        unit = factory.UnitFactory()
        # no measurements exist before import
        self.assertEqual(
            models.Measurement.objects.filter(study_id=self.target_study.pk).count(), 0
        )
        self._set_permission(permission_type=models.StudyPermission.WRITE)
        run = TableImport(self.target_study, self.user)
        added, updated = run.import_series_data(
            [
                {
                    "line_id": line.id,
                    "assay_id": assay.id,
                    "measurement_id": mtype.id,
                    "comp_id": models.Measurement.Compartment.UNKNOWN,
                    "units_id": unit.id,
                    "metadata": {},
                    "data": [[0, 0]],
                }
            ]
        )
        # after the self-reported add/update are correct
        self.assertEqual(added, 1)
        self.assertEqual(updated, 0)
        # and the counts are correct
        self.assertEqual(
            models.Measurement.objects.filter(study_id=self.target_study.pk).count(), 1
        )
