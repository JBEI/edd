"""Tests used to validate the tutorial screencast functionality."""

import uuid

from django.http import QueryDict
from django.urls import reverse
from requests import codes

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory


class FBAExportDataTests(TestCase):
    """
    Sets of tests to exercise the SBML and Table export views used in Tutorial #4 (Flux
    Balance Analysis).
    """

    TIMES = [0, 7.5, 9.5, 11, 13, 15, 17]
    OD_VALUES = [0.1, 1.49, 2.72, 3.95, 5.69, 6.41, 6.51]
    ACETATE_VALUES = [0, 0.33, 0.59, 0.68, 0.92, 0.89, 0.56]
    GLUCOSE_VALUES = [22.22, 15.48, 10.44, 7.98, 2.84, 0.3, 0]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        # IDs are hard-coded in FBA files in main/tests/files
        line1 = factory.LineFactory(id=998, study=cls.target_study, name="BW1")
        met1 = factory.MetaboliteFactory(id=898, type_name="D-Glucose")
        met2 = factory.MetaboliteFactory(id=899, type_name="Acetate")
        # optical density already defined in bootstrap
        od = models.MeasurementType.objects.get(
            uuid="d7510207-5beb-4d56-a54d-76afedcf14d0"
        )
        values = zip(cls.TIMES, cls.GLUCOSE_VALUES)
        cls._build_measurements(
            1000, models.Protocol.CATEGORY_HPLC, line1, met1, values
        )
        values = zip(cls.TIMES, cls.ACETATE_VALUES)
        cls._build_measurements(
            1001, models.Protocol.CATEGORY_HPLC, line1, met2, values
        )
        values = zip(cls.TIMES, cls.OD_VALUES)
        cls._build_measurements(1002, models.Protocol.CATEGORY_OD, line1, od, values)
        factory.SBMLTemplateFactory(id=666, uuid=uuid.uuid4())

    @classmethod
    def _build_measurements(cls, measurement_id, category, line, metabolite, values):
        protocol = factory.ProtocolFactory(sbml_category=category)
        assay = factory.AssayFactory(line=line, protocol=protocol)
        measurement = factory.MeasurementFactory(
            id=measurement_id, assay=assay, measurement_type=metabolite
        )
        for x, y in values:
            factory.ValueFactory(measurement=measurement, x=[x], y=[y])

    def setUp(self):
        super().setUp()
        self.target_kwargs = {"slug": self.target_study.slug}
        self.client.force_login(self.user)

    def test_step1_sbml_export(self):
        "First step loads the SBML export page, and has some warnings."
        response = self.client.get(reverse("export:sbml"), data={"lineId": 998})
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context["sbml_warnings"]), 6)

    def test_step2_sbml_export(self):
        "Second step selects an SBML Template."
        with factory.load_test_file("ExportData_FBA_step2.post") as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(reverse("export:sbml"), data=POST)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context["sbml_warnings"]), 5)

    def test_step3_sbml_export(self):
        "Third step maps metabolites to species/reactions, and selects an export timepoint."
        with factory.load_test_file("ExportData_FBA_step3.post") as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(reverse("export:sbml"), data=POST)
        self.assertEqual(response.status_code, codes.ok)
        # TODO figure out how to test content of chunked responses
