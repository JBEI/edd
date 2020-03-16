import json
from typing import List

from jsonschema import Draft4Validator

from edd import TestCase
from main.importer.experiment_desc import CombinatorialCreationImporter, constants
from main.importer.experiment_desc.importer import ExperimentDescriptionOptions
from main.importer.experiment_desc.parsers import (
    ExperimentDescFileParser,
    JsonInputParser,
)
from main.importer.experiment_desc.utilities import (
    CombinatorialDescriptionInput,
    ExperimentDescriptionContext,
)
from main.importer.experiment_desc.validators import SCHEMA as JSON_SCHEMA
from main.models import (
    SYSTEM_META_TYPES,
    Assay,
    CarbonSource,
    Line,
    MetadataType,
    Strain,
    Study,
)

from ..importer.parser import ImportFileTypeFlags
from . import factory


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
        cls.testuser = factory.UserFactory()
        cls.metabolomics = factory.ProtocolFactory(name="Metabolomics")
        cls.targeted_proteomics = factory.ProtocolFactory(name="Targeted Proteomics")
        cls.media_mtype = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Media"])

        # query the database and cache MetadataTypes, Protocols, etc that should be static
        # for the duration of the test
        cls.cache = ExperimentDescriptionContext()

    def _map_input_strains(self, inputs, strains=None):
        # TODO: this function should go away
        if strains is None:
            strains = {}
        for item in inputs:
            item.replace_ice_ids_with_edd_pks(strains, {}, self.cache.strains_mtype.pk)

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
        growth_temp_meta = MetadataType.objects.get(
            uuid=SYSTEM_META_TYPES["Growth temperature"]
        )
        cs_glucose, _ = CarbonSource.objects.get_or_create(
            name=r"1% Glucose", volume=10.00000
        )
        cs_galactose, _ = CarbonSource.objects.get_or_create(
            name=r"1% Galactose", volume=50
        )

        # Create non-standard objects to use as the basis for this test
        strain1 = Strain.objects.create(name="JW1058")
        strain2 = Strain.objects.create(name="JW5327")

        # Define JSON test input
        ui_json_output = json.dumps(
            {
                "name_elements": {
                    "elements": [
                        f"{self.cache.strains_mtype.pk}__name",
                        f"{self.media_mtype.pk}",
                        f"{self.cache.carbon_sources_mtype.pk}__name",
                        "replicate_num",
                    ],
                    "abbreviations": {
                        f"{self.cache.strains_mtype.pk}__name": {
                            "JW1058": 58,
                            "JW5327": 27,
                        },
                        f"{self.cache.carbon_sources_mtype.pk}__name": {
                            r"1% Glucose": "GLU",
                            r"1% Galactose": "GAL",
                        },
                    },
                },
                "replicate_count": 3,
                "common_line_metadata": {growth_temp_meta.pk: 30},
                "combinatorial_line_metadata": {
                    self.cache.strains_mtype.pk: [[strain1.pk], [strain2.pk]],
                    self.media_mtype.pk: ["EZ", "LB"],  # media
                    self.cache.carbon_sources_mtype.pk: [
                        [cs_galactose.pk],
                        [cs_glucose.pk],
                    ],
                },
            }
        )

        # combinations of metadata
        ez = {self.media_mtype.pk: "EZ", growth_temp_meta.pk: 30}
        lb = {self.media_mtype.pk: "LB", growth_temp_meta.pk: 30}

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

        self.cache.strains_by_pk = {strain1.pk: strain1, strain2.pk: strain2}

        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        parser = JsonInputParser(self.cache, importer)
        parsed = parser.parse(ui_json_output)
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, self.cache.strains_by_pk)
        importer._query_related_object_context(parsed)
        result = parsed[0].populate_study(
            study, importer.cache, ExperimentDescriptionOptions()
        )
        self.assertFalse(importer.errors, "Import generated errors")
        self.assertFalse(importer.warnings, "Import generated warnings")
        for line in result.lines_created:
            self.assertIn(line.name, expected_line_info)
            info = expected_line_info[line.name]
            self.assertEqual(line.metadata, info["meta"])
            cs_list = list(line.carbon_source.values_list("id", flat=True))
            self.assertEqual(cs_list, info["carbon"])

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
        # Create strains for this test
        strain, _ = Strain.objects.get_or_create(name="JW0111")
        self.cache.strains_by_pk = {strain.pk: strain}
        control = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Control"])

        # define test input
        test_input = {
            "name_elements": {"elements": ["_custom_1", "replicate_num"]},
            "custom_name_elts": {"_custom_1": "181-aceF"},
            "replicate_count": 3,
            "combinatorial_line_metadata": {},
            "common_line_metadata": {
                str(self.media_mtype.pk): "LB",
                str(control.pk): False,
                str(self.cache.strains_mtype.pk): [str(strain.uuid)],
            },
        }

        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        parser = JsonInputParser(self.cache, importer)
        parsed = parser.parse(json.dumps(test_input))
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, {str(strain.uuid): strain})
        importer._query_related_object_context(parsed)
        result = parsed[0].populate_study(
            study, importer.cache, ExperimentDescriptionOptions()
        )

        self.assertFalse(importer.errors, "Import generated errors")
        self.assertFalse(importer.warnings, "Import generated warnings")
        expected_line_names = ["181-aceF-R1", "181-aceF-R2", "181-aceF-R3"]
        for line in result.lines_created:
            self.assertIn(line.name, expected_line_names)
            self.assertFalse(line.control)
            strains_list = list(line.strains.values_list("id", flat=True))
            self.assertEqual(strains_list, [strain.pk])
            self.assertEqual(line.metadata, {self.media_mtype.pk: "LB"})

    def test_advanced_experiment_description_xlsx(self):
        strain, _ = Strain.objects.get_or_create(name="JW0111")
        self.cache.strains_by_pk = {strain.pk: strain}

        advanced_experiment_def_xlsx = factory.test_file_path(
            "experiment_description/advanced.xlsx"
        )
        study = factory.StudyFactory()
        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        parser = ExperimentDescFileParser(self.cache, importer)
        parsed = parser.parse_excel(advanced_experiment_def_xlsx)
        self.assertEqual(len(parsed), 1, "Expected a single set of parsed input")
        # TODO: following two calls should go away
        self._map_input_strains(parsed, {"JBx_002078": strain})
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
        study = Study.objects.create(name="Test")
        file = factory.test_file_path(
            "experiment_description/combinatorial_assays.xlsx"
        )

        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        with open(file, "rb") as fh:
            importer.do_import(
                fh,
                ExperimentDescriptionOptions(),
                filename="Fake Excel file",
                file_extension=ImportFileTypeFlags.EXCEL,
            )

        # verify results
        line = Line.objects.get(study_id=study.pk)
        self.assertEqual(line.assay_set.count(), 2)
        times = {
            assay.metadata_get(self.cache.assay_time_mtype)
            for assay in Assay.objects.filter(
                line=line, protocol=self.targeted_proteomics
            )
        }
        self.assertEqual(times, {8, 24})


class ExperimentDescriptionParseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.testuser = factory.UserFactory()
        cls.metabolomics = factory.ProtocolFactory(name="Metabolomics")
        cls.targeted_proteomics = factory.ProtocolFactory(name="Targeted Proteomics")
        cls.media_mtype = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Media"])

        # query the database and cache MetadataTypes, Protocols, etc that should be static
        # for the duration of the test
        cls.cache = ExperimentDescriptionContext()

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
        parser = ExperimentDescFileParser(self.cache, importer)
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

        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        parser = ExperimentDescFileParser(self.cache, importer)
        parsed: List[CombinatorialDescriptionInput] = parser.parse_csv(lines_iter)

        time_meta_type = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Time"])
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

        importer = CombinatorialCreationImporter(study, self.testuser, self.cache)
        parser = ExperimentDescFileParser(self.cache, importer)
        parsed: List[CombinatorialDescriptionInput] = parser.parse_excel(ed_file)
        combo_input: CombinatorialDescriptionInput = parsed[0]

        time_meta_type = MetadataType.objects.get(uuid=SYSTEM_META_TYPES["Time"])
        self.assertDictEqual(
            combo_input.protocol_to_combinatorial_meta_dict,
            {
                self.targeted_proteomics.pk: {time_meta_type.pk: [8.0, 24.0]},
                self.metabolomics.pk: {time_meta_type.pk: [4.0, 6.0]},
            },
        )
