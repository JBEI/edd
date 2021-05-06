import json

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from ..importer import CombinatorialCreationImporter, ExperimentDescriptionOptions
from ..parsers import ExperimentDescFileParser, JsonInputParser
from ..utilities import ExperimentDescriptionContext


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
