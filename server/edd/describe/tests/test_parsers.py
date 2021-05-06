from typing import List

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from .. import constants
from ..importer import CombinatorialCreationImporter
from ..parsers import ExperimentDescFileParser
from ..utilities import CombinatorialDescriptionInput, ExperimentDescriptionContext


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
