import io
import json
from typing import List
from unittest.mock import patch

from django.urls import reverse
from jsonschema import Draft4Validator
from requests import codes

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from . import constants
from .importer import CombinatorialCreationImporter, ExperimentDescriptionOptions
from .parsers import ExperimentDescFileParser, JsonInputParser
from .utilities import CombinatorialDescriptionInput, ExperimentDescriptionContext
from .validators import SCHEMA as JSON_SCHEMA

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def test_json_schema_valid():
    Draft4Validator.check_schema(JSON_SCHEMA)


# TODO: tests have ICE integration now; should do:
#   - ensure test ICE has some baseline strains to be found by tests
#   - remove shims that duplicate code under test to avoid hitting ICE
#   - mark tests, so they may be skipped if running without ICE
class CombinatorialCreationTests(TestCase):
    """
    Defines automated integration tests for most of the supporting back-end
    code for experiment description file upload and combinatorial line creation
    (processes are very similar/based on the same code)
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.testuser = UserFactory()
        cls.metabolomics = factory.ProtocolFactory(name="Metabolomics")
        cls.targeted_proteomics = factory.ProtocolFactory(name="Targeted Proteomics")

    def _map_input_strains(self, inputs, cache, strains=None):
        # TODO: this function should go away
        if strains is None:
            strains = {}
        for item in inputs:
            item.replace_ice_ids_with_edd_pks(strains, {}, cache.strains_mtype.pk)

    def test_add_line_combos_use_case(self):
        """
        A simplified integration test that exercises much of the EDD code
        responsible for combinatorial line creation based on a typical use
        case. Test input here is very similar to that displayed in the
        combinatorial GUI mockup attached to EDD-257.

        Testing the full code path for EDD's experiment description back-end
        support requires having a corresponding ICE deployment to use as part
        of the test, so it's not addressed here.
        """

        # Load model objects for use in this test
        meta1 = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        meta2 = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        strains_mtype = models.MetadataType.system("Strain(s)")
        carbon_sources_mtype = models.MetadataType.system("Carbon Source(s)")
        cs_glucose, _ = models.CarbonSource.objects.get_or_create(
            name=r"1% Glucose", volume=10.00000
        )
        cs_galactose, _ = models.CarbonSource.objects.get_or_create(
            name=r"1% Galactose", volume=50
        )

        # Create non-standard objects to use as the basis for this test
        strain1 = models.Strain.objects.create(name="JW1058")
        strain2 = models.Strain.objects.create(name="JW5327")

        # Define JSON test input
        ui_json_output = json.dumps(
            {
                "name_elements": {
                    "elements": [
                        f"{strains_mtype.pk}__name",
                        f"{meta2.pk}",
                        f"{carbon_sources_mtype.pk}__name",
                        "replicate_num",
                    ],
                    "abbreviations": {
                        f"{strains_mtype.pk}__name": {"JW1058": 58, "JW5327": 27},
                        f"{carbon_sources_mtype.pk}__name": {
                            r"1% Glucose": "GLU",
                            r"1% Galactose": "GAL",
                        },
                    },
                },
                "replicate_count": 3,
                "common_line_metadata": {meta1.pk: 30},
                "combinatorial_line_metadata": {
                    strains_mtype.pk: [[strain1.pk], [strain2.pk]],
                    meta2.pk: ["EZ", "LB"],  # media
                    carbon_sources_mtype.pk: [[cs_galactose.pk], [cs_glucose.pk]],
                },
            }
        )

        # combinations of metadata
        ez = {meta2.pk: "EZ", meta1.pk: 30}
        lb = {meta2.pk: "LB", meta1.pk: 30}

        expected_line_info = {
            "58-EZ-GLU-R1": {"meta": ez, "carbon": [cs_glucose.pk]},
            "58-EZ-GLU-R2": {"meta": ez, "carbon": [cs_glucose.pk]},
            "58-EZ-GLU-R3": {"meta": ez, "carbon": [cs_glucose.pk]},
            "58-EZ-GAL-R1": {"meta": ez, "carbon": [cs_galactose.pk]},
            "58-EZ-GAL-R2": {"meta": ez, "carbon": [cs_galactose.pk]},
            "58-EZ-GAL-R3": {"meta": ez, "carbon": [cs_galactose.pk]},
            "58-LB-GLU-R1": {"meta": lb, "carbon": [cs_glucose.pk]},
            "58-LB-GLU-R2": {"meta": lb, "carbon": [cs_glucose.pk]},
            "58-LB-GLU-R3": {"meta": lb, "carbon": [cs_glucose.pk]},
            "58-LB-GAL-R1": {"meta": lb, "carbon": [cs_galactose.pk]},
            "58-LB-GAL-R2": {"meta": lb, "carbon": [cs_galactose.pk]},
            "58-LB-GAL-R3": {"meta": lb, "carbon": [cs_galactose.pk]},
            "27-EZ-GLU-R1": {"meta": ez, "carbon": [cs_glucose.pk]},
            "27-EZ-GLU-R2": {"meta": ez, "carbon": [cs_glucose.pk]},
            "27-EZ-GLU-R3": {"meta": ez, "carbon": [cs_glucose.pk]},
            "27-EZ-GAL-R1": {"meta": ez, "carbon": [cs_galactose.pk]},
            "27-EZ-GAL-R2": {"meta": ez, "carbon": [cs_galactose.pk]},
            "27-EZ-GAL-R3": {"meta": ez, "carbon": [cs_galactose.pk]},
            "27-LB-GLU-R1": {"meta": lb, "carbon": [cs_glucose.pk]},
            "27-LB-GLU-R2": {"meta": lb, "carbon": [cs_glucose.pk]},
            "27-LB-GLU-R3": {"meta": lb, "carbon": [cs_glucose.pk]},
            "27-LB-GAL-R1": {"meta": lb, "carbon": [cs_galactose.pk]},
            "27-LB-GAL-R2": {"meta": lb, "carbon": [cs_galactose.pk]},
            "27-LB-GAL-R3": {"meta": lb, "carbon": [cs_galactose.pk]},
        }

        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()
        cache.strains_by_pk = {strain1.pk: strain1, strain2.pk: strain2}

        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        parser = JsonInputParser(cache, importer)
        parsed = parser.parse(ui_json_output)
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, cache, cache.strains_by_pk)
        importer._query_related_object_context(parsed)
        result = parsed[0].populate_study(
            study, importer.cache, ExperimentDescriptionOptions()
        )
        self.assertFalse(importer.errors, "Import generated errors")
        self.assertFalse(importer.warnings, "Import generated warnings")
        for line in result.lines_created:
            self.assertIn(line.name, expected_line_info)
            info = expected_line_info[line.name]
            cs_list = list(line.carbon_source.values_list("id", flat=True))
            self.assertEqual(cs_list, info["carbon"])
            # because of replicate, the expected metadata is a subset of actual
            assert {*info["meta"].items()}.issubset({*line.metadata.items()})

    def test_basic_json(self):
        """
        A simplified integration test that exercises much of the EDD code
        responsible for combinatorial line creation based on a simplified
        input, creating replicates for a single line with some metadata using
        a known strain. Test inputs in this example roughly correspond to the
        sample experiment description file attached to EDD-380.

        Testing the full code path for EDD's experiment description file
        support requires having a corresponding ICE deployment to use as part
        of the test, so it's not addressed here.
        """
        meta = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
        # Create strains for this test
        strain, _ = models.Strain.objects.get_or_create(name="JW0111")
        control = models.MetadataType.system("Control")

        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()
        cache.strains_by_pk = {strain.pk: strain}

        # define test input
        test_input = {
            "name_elements": {"elements": ["_custom_1", "replicate_num"]},
            "custom_name_elts": {"_custom_1": "181-aceF"},
            "replicate_count": 3,
            "combinatorial_line_metadata": {},
            "common_line_metadata": {
                str(meta.pk): "LB",
                str(control.pk): False,
                str(cache.strains_mtype.pk): [str(strain.uuid)],
            },
        }

        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        parser = JsonInputParser(cache, importer)
        parsed = parser.parse(json.dumps(test_input))
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, cache, {str(strain.uuid): strain})
        importer._query_related_object_context(parsed)
        result = parsed[0].populate_study(
            study, importer.cache, ExperimentDescriptionOptions()
        )

        self.assertFalse(importer.errors, "Import generated errors")
        self.assertFalse(importer.warnings, "Import generated warnings")
        expected_line_names = ["181-aceF-R1", "181-aceF-R2", "181-aceF-R3"]
        expected_meta = {meta.pk: "LB"}
        for line in result.lines_created:
            self.assertIn(line.name, expected_line_names)
            self.assertFalse(line.control)
            strains_list = list(line.strains.values_list("id", flat=True))
            self.assertEqual(strains_list, [strain.pk])
            # because of replicate, the expected metadata is a subset of actual
            assert {*expected_meta.items()}.issubset({*line.metadata.items()})

    def test_advanced_experiment_description_xlsx(self):
        strain, _ = models.Strain.objects.get_or_create(name="JW0111")
        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()
        cache.strains_by_pk = {strain.pk: strain}

        advanced_experiment_def_xlsx = factory.test_file_path(
            "experiment_description/advanced.xlsx"
        )
        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        parser = ExperimentDescFileParser(cache, importer)
        parsed = parser.parse_excel(advanced_experiment_def_xlsx)
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, cache, {"JBx_002078": strain})
        importer._query_related_object_context(parsed)
        result = parsed[0].populate_study(
            study, importer.cache, ExperimentDescriptionOptions()
        )

        self.assertFalse(importer.errors, "Import generated errors")
        self.assertFalse(importer.warnings, "Import generated warnings")
        for line in result.lines_created:
            self.assertEqual(line.description, "Description blah blah")
            self.assertEqual(line.assay_set.count(), 4)

    def test_combinatorial_assay_creation(self):
        """
        Tests combinatorial assay creation, e.g. from combinatorial time values in the Skyline
        workflow.
        """
        study = models.Study.objects.create(name="Test")
        file = factory.test_file_path(
            "experiment_description/combinatorial_assays.xlsx"
        )
        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()

        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        with open(file, "rb") as fh:
            importer.do_import(
                fh,
                ExperimentDescriptionOptions(),
                filename="Fake Excel file",
                file_extension="xlsx",
            )

        # verify results
        line = models.Line.objects.get(study_id=study.pk)
        self.assertEqual(line.assay_set.count(), 2)
        times = {
            assay.metadata_get(cache.assay_time_mtype)
            for assay in models.Assay.objects.filter(
                line=line, protocol=self.targeted_proteomics
            )
        }
        self.assertEqual(times, {8, 24})


class ExperimentDescriptionParseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.testuser = UserFactory()
        cls.metabolomics = factory.ProtocolFactory(name="Metabolomics")
        cls.targeted_proteomics = factory.ProtocolFactory(name="Targeted Proteomics")

    def test_ed_file_parse_err_detection(self):
        """"
        Tests for Experiment Description file errors that can be caught during
        parsing. Error detection includes catching column headers that don't
        match any of:

        1) Line attributes supported by the parser (e.g. line name)
        2) Line metadata defined in the database
        3) Protocol + assay metadata defined in the database

        Also tests duplicate column header detection for each type of column
        definition implied by 1-3 above.
        """
        # parameters don't matter for test, but need to be there
        importer = CombinatorialCreationImporter(None, None)
        file_path = factory.test_file_path("experiment_description/parse_errors.xlsx")
        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()
        parser = ExperimentDescFileParser(cache, importer)
        parser.parse_excel(file_path)
        # expect to find these errors
        exp_errors = [
            (
                constants.BAD_FILE_CATEGORY,
                constants.INVALID_COLUMN_HEADER,
                '"T3mperature" (col B)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.DUPLICATE_LINE_METADATA,
                '"Media" (col G)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.UNMATCHED_ASSAY_COL_HEADERS_KEY,
                '"Tomperature" (col H)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.DUPLICATE_LINE_ATTR,
                '"Line Name" (col I)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.DUPLICATE_LINE_ATTR,
                '"Replicate Count" (col J)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.DUPLICATE_ASSAY_METADATA,
                '"Targeted Proteomics Time" (col K)',
            ),
            (
                constants.BAD_FILE_CATEGORY,
                constants.DUPLICATE_LINE_METADATA,
                '"Strain(s)" (col L)',
            ),
            (
                constants.BAD_GENERIC_INPUT_CATEGORY,
                constants.INVALID_REPLICATE_COUNT,
                '"X" (D2)',
            ),
            (
                constants.INVALID_FILE_VALUE_CATEGORY,
                constants.MISSING_REQUIRED_LINE_NAME,
                "A3",
            ),
            (
                constants.INVALID_FILE_VALUE_CATEGORY,
                constants.INCORRECT_TIME_FORMAT,
                '"A" (F4)',
            ),
            (
                constants.INVALID_FILE_VALUE_CATEGORY,
                constants.DUPLICATE_LINE_NAME_LITERAL,
                '"181-aceF" (A2, A4)',
            ),
        ]
        for category, heading, detail in exp_errors:
            # make sure the category shows up
            assert category in importer.errors
            # make sure the heading shows up
            category_group = importer.errors.get(category)
            assert heading in category_group
            # make sure the heading has the right details
            assert detail in category_group.get(heading)._occurrence_details

    def test_single_valued_metadata_parsing(self):
        """
        Tests parsing of single-valued (non-combinatorial) assay metadata from an Experiment
        Description file,  e.g. as used in the Skyline workflow for proteomics.
        """
        lines_iter = iter(("Line Name, Targeted Proteomics Time", "A, 2h", "B, 5h"))
        study = factory.StudyFactory()
        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()

        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        parser = ExperimentDescFileParser(cache, importer)
        parsed: List[CombinatorialDescriptionInput] = parser.parse_csv(lines_iter)

        time_meta_type = models.MetadataType.system("Time")
        self.assertDictEqual(
            parsed[0].protocol_to_assay_metadata,
            {self.targeted_proteomics.pk: {time_meta_type.pk: 2.0}},
        )

        self.assertDictEqual(
            parsed[1].protocol_to_assay_metadata,
            {self.targeted_proteomics.pk: {time_meta_type.pk: 5.0}},
        )

    def test_combinatorial_metadata_parsing(self):
        """
        Tests parsing of combinatorial assay metadata from an Experiment Description file, e.g.
        as used in the Skyline workflow for proteomics.
        """
        ed_file = factory.test_file_path("experiment_description/advanced.xlsx")
        study = factory.StudyFactory()
        # creating *AFTER* setup of testing database records
        cache = ExperimentDescriptionContext()

        importer = CombinatorialCreationImporter(study, self.testuser, cache)
        parser = ExperimentDescFileParser(cache, importer)
        parsed: List[CombinatorialDescriptionInput] = parser.parse_excel(ed_file)
        combo_input: CombinatorialDescriptionInput = parsed[0]

        time_meta_type = models.MetadataType.system("Time")
        self.assertDictEqual(
            combo_input.protocol_to_combinatorial_meta_dict,
            {
                self.targeted_proteomics.pk: {time_meta_type.pk: [8.0, 24.0]},
                self.metabolomics.pk: {time_meta_type.pk: [4.0, 6.0]},
            },
        )


class ViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study_kwargs = {"slug": cls.study.slug}
        cls.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=cls.user
        )

    def test_get_global_HelpView(self):
        response = self.client.get(reverse("main:describe_flat:help"))
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_scoped_HelpView(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:help", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/help.html")

    def test_get_global_ice_view_redirects_anonymous(self):
        folder_url = reverse("main:describe_flat:folder")
        response = self.client.get(folder_url, follow=True)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={folder_url}")

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_found(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        folder = ice.folder_from_url.return_value
        folder.to_json_dict.return_value = {"id": 1234, "name": "fake"}
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.ok)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_missing(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        ice.folder_from_url.return_value = None
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.not_found)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_global_IceFolderView_error(self, connector):
        self.client.force_login(self.user)
        # to avoid triggering a real error
        # fake the connection raising an error
        connector.side_effect = ValueError()
        response = self.client.get(reverse("main:describe_flat:folder"))
        self.assertEqual(response.status_code, codes.internal_server_error)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_found(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        folder = ice.folder_from_url.return_value
        folder.to_json_dict.return_value = {"id": 1234, "name": "fake"}
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_missing(self, connector):
        self.client.force_login(self.user)
        # to avoid populating testing ICE with specific data
        # fake the connection
        ice = connector.return_value
        ice.folder_from_url.return_value = None
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.not_found)

    @patch("edd.describe.views.create_ice_connection")
    def test_get_scoped_IceFolderView_error(self, connector):
        self.client.force_login(self.user)
        # to avoid triggering a real error
        # fake the connection raising an error
        connector.side_effect = ValueError()
        url = reverse("main:describe:folder", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.internal_server_error)

    def test_get_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_get_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_get_DescribeView_writer(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.get(url)
        self.assertEqual(response.status_code, codes.ok)
        self.assertTemplateUsed(response, "edd/describe/combos.html")

    def test_post_DescribeView_no_permission(self):
        other_user = UserFactory()
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, codes.not_found)

    def test_post_DescribeView_readonly(self):
        other_user = UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=other_user
        )
        self.client.force_login(other_user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        self.assertEqual(response.status_code, codes.forbidden)

    def test_post_DescribeView_writer_empty(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        response = self.client.post(url)
        # TODO: this describes current behavior!
        # it should return codes.bad_request
        # with details on why an empty request is bad m'kay
        self.assertEqual(response.status_code, codes.internal_server_error)

    def test_post_DescribeView_writer_json(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal JSON from front-end
        payload = br"""
            {
                "name_elements":{
                    "elements":["replicate_num"]
                },
                "custom_name_elts":{},
                "replicate_count":1,
                "combinatorial_line_metadata":{},
                "common_line_metadata":{}
            }
            """
        response = self.client.post(
            url, payload.strip(), content_type="application/json"
        )
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 1)

    def test_post_DescribeView_writer_csv(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal description of two lines
        file = io.BytesIO(b"Line Name,\nfoo,\nbar,")
        file.name = "description.csv"
        file.content_type = "text/csv"
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 2)

    def test_post_DescribeView_writer_xlsx(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 2)

    def test_post_DescribeView_writer_invalid_contenttype(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        # minimal description of two lines
        file = io.BytesIO(b"")
        file.name = "testfile.docx"
        file.content_type = "application/octet-stream"
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.bad_request)

    def test_post_DescribeView_writer_xlsx_double_import(self):
        # run test_post_DescribeView_writer_xlsx
        self.test_post_DescribeView_writer_xlsx()
        # then do its insides again, checking for errors
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_simple.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertEqual(len(messages["errors"]), 1)
        self.assertEqual(messages["errors"][0]["category"], "Non-unique line names")

    def test_post_DescribeView_writer_xlsx_bad_headers(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_headers.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(self.study.line_set.count(), 2)
        messages = response.json()
        self.assertNotIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(messages["warnings"][0]["category"], "User input ignored")

    def test_post_DescribeView_writer_xlsx_bad_values(self):
        self.client.force_login(self.user)
        url = reverse("main:describe:describe", kwargs=self.study_kwargs)
        filename = "ExperimentDescription_bad_values.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = XLSX_CONTENT_TYPE
        payload = {"file": file}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, codes.bad_request)
        self.assertEqual(self.study.line_set.count(), 0)
        messages = response.json()
        self.assertIn("errors", messages)
        self.assertIn("warnings", messages)
        self.assertEqual(len(messages["errors"]), 2)
        self.assertEqual(
            {"Incorrect file format", "Invalid values"},
            {err["category"] for err in messages["errors"]},
        )
