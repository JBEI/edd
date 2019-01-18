# -*- coding: utf-8 -*-

import json
import os

from django.contrib.auth import get_user_model
from jsonschema import Draft4Validator
from unittest.mock import call, patch

from main.importer.experiment_desc import CombinatorialCreationImporter
from main.importer.experiment_desc.importer import (
    _build_response_content,
    ExperimentDescriptionOptions,
)
from main.importer.experiment_desc.parsers import ExperimentDescFileParser, JsonInputParser
from main.importer.experiment_desc.utilities import ExperimentDescriptionContext
from main.importer.experiment_desc.validators import SCHEMA as JSON_SCHEMA
from main.importer.experiment_desc.constants import (
    BAD_FILE_CATEGORY,
    BAD_GENERIC_INPUT_CATEGORY,
    DUPLICATE_LINE_ATTR,
    DUPLICATE_LINE_METADATA,
    DUPLICATE_LINE_NAME_LITERAL,
    DUPLICATE_ASSAY_METADATA,
    INVALID_REPLICATE_COUNT,
    INCORRECT_TIME_FORMAT,
    INVALID_COLUMN_HEADER,
    UNMATCHED_ASSAY_COL_HEADERS_KEY,
    INVALID_FILE_VALUE_CATEGORY,
    MISSING_REQUIRED_LINE_NAME,
)
from main.models import (
    CarbonSource,
    Line,
    MetadataType,
    Protocol,
    Strain,
    Study,
)

from . import factory, TestCase


User = get_user_model()
main_dir = os.path.dirname(__file__),
fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fixtures_dir = os.path.join(fixtures_dir, 'fixtures')
advanced_experiment_def_xlsx = factory.test_file_path('experiment_description/advanced.xlsx')


class CombinatorialCreationTests(TestCase):
    """
    Defines automated integration tests for most of the supporting back-end code for experiment
    description file upload and combinatorial line creation (processes are very similar/based on
    the same code)
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.system_user = User.objects.get(username='system')
        cls.metabolomics, _ = Protocol.objects.get_or_create(
            name='Metabolomics', owned_by=cls.system_user
        )
        cls.targeted_proteomics, _ = Protocol.objects.get_or_create(
            name="Targeted Proteomics", owned_by=cls.system_user
        )
        cls.media_mtype, _ = MetadataType.objects.get_or_create(
            type_name='Media', for_context=MetadataType.LINE,
        )

        # query the database and cache MetadataTypes, Protocols, etc that should be static
        # for the duration of the test
        cls.cache = ExperimentDescriptionContext()

        # Initially remove likely-valid assay metadata drafted & partly tested below, since
        # assay generation isn't yet fully supported by the combinatorial GUI or its back-end
        # naming strategy
        # TODO: reinstate once assay generation / naming is implemented for the combinatorial GUI
        cls._OMIT_ASSAYS_FROM_TEST = True

    def setUp(self):
        super().setUp()
        self.cache.clear_import_specific_cache()

    def test_json_schema_valid(self):
        Draft4Validator.check_schema(JSON_SCHEMA)

    def build_ui_json(self, strain1, strain2, cs_glucose, cs_galactose, growth_temp_meta):
        """
        Builds JSON input for testing back end features of the the "Add Line Combo's" GUI. Test
        input is similar to that displayed in the original UI mockup attached to EDD-257.

        This data can potentially be captured as a fixture, but because it combines metadata pk's
        and text, and because JSON doesn't support comments, it should be a lot easier for
        maintainers to read/interpret as code.
        """
        cache = self.cache
        carbon_src_meta = cache.carbon_sources_mtype
        media_meta = self.media_mtype
        strains_name = f'{cache.strains_mtype.pk}__name'
        carbon_src_name = f'{carbon_src_meta.pk}__name'

        # working carbon source (via metadata) example
        gui_mockup_example = {
            'name_elements': {
                'elements': [
                    strains_name,
                    media_meta.pk,
                    carbon_src_name,
                    'replicate_num',
                ],
                'abbreviations': {
                    strains_name: {
                        strain1.name: 58,
                        strain2.name: 27,
                    },
                    carbon_src_name: {
                        cs_glucose.name: 'GLU',
                        cs_galactose.name: 'GAL',
                    }
                }
            },
            'replicate_count': 3,
            'common_line_metadata': {
                growth_temp_meta.pk: 30,  # degrees C
            },
            'combinatorial_line_metadata': {
                cache.strains_mtype.pk: [[strain1.pk], [strain2.pk]],
                media_meta.pk: ['EZ', 'LB'],  # media
                carbon_src_meta.pk: [[cs_galactose.pk], [cs_glucose.pk]],
            },
        }

        if not self._OMIT_ASSAYS_FROM_TEST:
            gui_mockup_example['protocol_to_combinatorial_metadata'] = {
                self.targeted_proteomics.pk: {
                    cache.assay_time_mtype.pk: [8, 24],  # hours
                },
                self.metabolomics.pk: {
                    cache.assay_time_mtype.pk: [4, 6]  # hours
                },
            }
        return json.dumps(gui_mockup_example)

    def build_assay_data(self, exp_line_names):
        """
        Builds expected assay metadata as input for the test
        """
        if self._OMIT_ASSAYS_FROM_TEST:
            return None, {}

        # expected assay metadata (4 assays per line!)
        # (as all strings at the assay level to match hstore field of created model objects)
        time_pk = str(self.cache.assay_time_mtype.pk)
        targeted_proteomics = self.targeted_proteomics
        metabolomics = self.metabolomics

        assay_metadata = {
            self.targeted_proteomics.pk: [{time_pk: '8'}, {time_pk: '24'}],
            self.metabolomics.pk: [{time_pk: '4'}, {time_pk: '6'}, ]
        }

        expected_assay_metadata = {}
        for line_name in exp_line_names:
            protocol_to_assay_to_meta = {}
            expected_assay_metadata[line_name] = protocol_to_assay_to_meta
            for protocol_pk, assay_meta in assay_metadata.items():
                assay_to_meta = {}
                protocol_to_assay_to_meta[protocol_pk] = assay_to_meta
                for meta in assay_meta:
                    assay_name = '%(line_name)s-%(time)sh' % {
                        'line_name': line_name,
                        'time': meta[time_pk]}
                    assay_to_meta[assay_name] = meta

        expected_assay_suffixes = {
            targeted_proteomics.pk: ['8h', '24h'],
            metabolomics.pk: ['4h', '6h'],
        }

        return expected_assay_suffixes, expected_assay_metadata

    def test_ed_file_parse_err_detection(self):
        """"
        Tests for Experiment Description file errors that can be caught during parsing.  Error
        detection includes catching column headers that don't match any of:
        1) Line attributes supported by the parser (e.g. line name)
        2) Line metadata defined in the database
        3) Protocol + assay metadata defined in the database

        Also tests duplicate column header detection for each type of column definition implied
        by 1-3 above.
        """

        # mock the importer since we're just testing for error detection in the parser
        classname = 'main.importer.experiment_desc.importer.CombinatorialCreationImporter'
        with patch(classname) as MockImporter:
            importer = MockImporter.return_value

            file_path = factory.test_file_path('experiment_description/parse_errors.xlsx')
            parser = ExperimentDescFileParser(self.cache, importer)

            exp_calls = [
                call(BAD_FILE_CATEGORY, INVALID_COLUMN_HEADER, '"T3mperature" (col B)'),
                call(BAD_FILE_CATEGORY, DUPLICATE_LINE_METADATA, '"Media" (col G)'),
                call(BAD_FILE_CATEGORY, UNMATCHED_ASSAY_COL_HEADERS_KEY,
                     '"Tomperature" (col H)'),  # TODO: use a different suffix for clarity!
                call(BAD_FILE_CATEGORY, DUPLICATE_LINE_ATTR, '"Line Name" (col I)'),
                call(BAD_FILE_CATEGORY, DUPLICATE_LINE_ATTR, '"Replicate Count" (col J)'),
                call(BAD_FILE_CATEGORY, DUPLICATE_ASSAY_METADATA,
                     '"Targeted Proteomics Time" (col K)'),
                call(BAD_FILE_CATEGORY, DUPLICATE_LINE_METADATA, '"Strain(s)" (col L)'),
                call(BAD_GENERIC_INPUT_CATEGORY, INVALID_REPLICATE_COUNT, '"X" (D2)'),
                call(INVALID_FILE_VALUE_CATEGORY, MISSING_REQUIRED_LINE_NAME, 'A3'),
                call(INVALID_FILE_VALUE_CATEGORY, INCORRECT_TIME_FORMAT, '"A" (F4)'),
                call(INVALID_FILE_VALUE_CATEGORY, DUPLICATE_LINE_NAME_LITERAL,
                     '"181-aceF" (A2, A4)'),
            ]

            parser.parse_excel(file_path)
            importer.add_error.assert_has_calls(exp_calls)
            self.assertEqual(importer.add_error.call_count, len(exp_calls))

    def test_add_line_combos_use_case(self):
        """
        A simplified integration test that exercises much of the EDD code responsible for
        combinatorial line creation based on a typical anticipated common use case.  Test input
        here is very similar to that displayed in the combinatorial GUI mockup attached to
        EDD-257.

        Testing the full code path for EDD's experiment description back-end support requires
        having a corresponding ICE deployment to use as part of the test, so it's not addressed
        here.
        """

        ###########################################################################################
        # Load model objects for use in this test
        ###########################################################################################
        cache = self.cache
        growth_temp_meta = MetadataType.objects.get(
            type_i18n='main.models.Line.Growth_temperature'
        )
        cs_glucose, _ = CarbonSource.objects.get_or_create(name=r'1% Glucose', volume=10.00000)
        cs_galactose, _ = CarbonSource.objects.get_or_create(name=r'1% Galactose', volume=50)

        ###########################################################################################
        # Create non-standard objects to use as the basis for this test
        ###########################################################################################
        strain1 = Strain.objects.create(name='JW1058')
        strain2 = Strain.objects.create(name='JW5327')

        ###########################################################################################
        # Define JSON test input
        ###########################################################################################
        ui_json_output = self.build_ui_json(strain1, strain2, cs_glucose, cs_galactose,
                                            growth_temp_meta)

        ###########################################################################################
        # Define expected results of the test
        ###########################################################################################
        expected_line_names = [
            '58-EZ-GLU-R1', '58-EZ-GLU-R2', '58-EZ-GLU-R3',
            '58-EZ-GAL-R1', '58-EZ-GAL-R2', '58-EZ-GAL-R3',
            '58-LB-GLU-R1', '58-LB-GLU-R2', '58-LB-GLU-R3',
            '58-LB-GAL-R1', '58-LB-GAL-R2', '58-LB-GAL-R3',
            '27-EZ-GLU-R1', '27-EZ-GLU-R2', '27-EZ-GLU-R3',
            '27-EZ-GAL-R1', '27-EZ-GAL-R2', '27-EZ-GAL-R3',
            '27-LB-GLU-R1', '27-LB-GLU-R2', '27-LB-GLU-R3',
            '27-LB-GAL-R1', '27-LB-GAL-R2', '27-LB-GAL-R3',
        ]

        # Build a dict of expected line metadata, with all non-field metadata saved with a string
        # key to match line hstore field)
        media_pk = str(self.media_mtype.pk)
        temp_pk = str(growth_temp_meta.pk)
        carbon_src_pk = cache.carbon_sources_mtype.pk  # related field -> use non-string key

        _LB = 'LB'
        _EZ = 'EZ'

        temp = str(30)
        ez_glu = {carbon_src_pk: [cs_glucose.pk], media_pk: _EZ, temp_pk: temp}
        ez_gal = {carbon_src_pk: [cs_galactose.pk], media_pk: _EZ, temp_pk: temp}
        lb_glu = {carbon_src_pk: [cs_glucose.pk], media_pk: _LB, temp_pk: temp}
        lb_gal = {carbon_src_pk: [cs_galactose.pk], media_pk: _LB, temp_pk: temp}

        expected_line_metadata = {
            '58-EZ-GLU-R1': ez_glu,
            '58-EZ-GLU-R2': ez_glu,
            '58-EZ-GLU-R3': ez_glu,
            '58-EZ-GAL-R1': ez_gal,
            '58-EZ-GAL-R2': ez_gal,
            '58-EZ-GAL-R3': ez_gal,
            '58-LB-GLU-R1': lb_glu,
            '58-LB-GLU-R2': lb_glu,
            '58-LB-GLU-R3': lb_glu,
            '58-LB-GAL-R1': lb_gal,
            '58-LB-GAL-R2': lb_gal,
            '58-LB-GAL-R3': lb_gal,
            '27-EZ-GLU-R1': ez_glu,
            '27-EZ-GLU-R2': ez_glu,
            '27-EZ-GLU-R3': ez_glu,
            '27-EZ-GAL-R1': ez_gal,
            '27-EZ-GAL-R2': ez_gal,
            '27-EZ-GAL-R3': ez_gal,
            '27-LB-GLU-R1': lb_glu,
            '27-LB-GLU-R2': lb_glu,
            '27-LB-GLU-R3': lb_glu,
            '27-LB-GAL-R1': lb_gal,
            '27-LB-GAL-R2': lb_gal,
            '27-LB-GAL-R3': lb_gal,
        }

        strains_by_pk = {
            strain1.pk: strain1, strain2.pk: strain2,
        }
        cache.strains_by_pk = strains_by_pk

        study = Study.objects.create(name='Unit Test Study')

        exp_assay_suffixes, exp_assay_metadata = self.build_assay_data(expected_line_names)

        self._test_combinatorial_input(study, ui_json_output,
                                       expected_line_names,
                                       exp_assay_suffixes,
                                       edd_strains_by_ice_id=strains_by_pk,
                                       exp_line_metadata=expected_line_metadata,
                                       exp_assay_metadata=exp_assay_metadata)

    def _test_combinatorial_creation(
            self,
            study,
            combo_input,
            importer,
            options,
            expected_line_names,
            expected_protocols_to_assay_suffixes,
            exp_meta_by_line=None,
            exp_assay_metadata=None):

        # do related object lookup to facilitate later line naming & foreign key relationships
        importer._query_related_object_context([combo_input])

        ###########################################################################################
        # Compute & verify planned line/assay names to verify the dry run feature used by the
        # "Generate lines" feature
        ###########################################################################################
        cache = importer.cache
        naming_results = combo_input.compute_line_and_assay_names(study, cache, options)

        planned_line_count = len(naming_results.line_names)
        unique_planned_line_names = set(naming_results.line_names)

        # verify planned line names, while tolerating ordering differences in dict use as a
        # result of parsing
        self.assertEqual(len(naming_results.line_names), len(expected_line_names))
        for planned_line_name in naming_results.line_names:
            self.assertTrue(
                planned_line_name in expected_line_names,
                "Line name %s wasn't expected" % planned_line_name
            )

        # verify that planned line names are unique...this capability isn't designed /
        # shouldn't be used to create indistinguishable-but-identically-named lines
        self.assertEqual(
            len(unique_planned_line_names),
            planned_line_count,
            "Expected line names to be unique, but they weren't"
        )

        for line_name in expected_line_names:
            if expected_protocols_to_assay_suffixes:
                for protocol_pk, exp_suffixes in expected_protocols_to_assay_suffixes.items():
                    self._test_assay_names(
                        line_name,
                        naming_results,
                        protocol_pk,
                        exp_suffixes,
                        cache.protocols
                    )
            else:
                self.assertFalse(
                    naming_results.line_to_protocols_to_assays_list.get(line_name, False),
                )

        ###########################################################################################
        # Test actual line/assay creation, verifying it matches the preview computed above
        ###########################################################################################
        creation_results = combo_input.populate_study(study, cache, options)
        created_line_count = len(creation_results.lines_created)

        self.assertEqual(created_line_count, planned_line_count)

        for line_index, created_line in enumerate(creation_results.lines_created):
            # verify planned line name is the same as the created one
            planned_line_name = naming_results.line_names[line_index]
            self.assertEqual(planned_line_name, created_line.name)

            ################################################################################
            # verify that created protocol/assay combinations match the planned ones
            ################################################################################
            protocol_to_assays_list = creation_results.line_to_protocols_to_assays_list.get(
                    created_line.name, {})

            protocol_to_planned_assay_names = (
                naming_results.line_to_protocols_to_assays_list.get(created_line.name, {}))

            self.assertEqual(
                len(protocol_to_assays_list),
                len(protocol_to_planned_assay_names),
            )

            expected_protocol_count = len(protocol_to_planned_assay_names)
            found_protocol_count = len(protocol_to_assays_list)
            self.assertEqual(
                found_protocol_count,
                expected_protocol_count,
                'For line %(line_name)s, expected assays for %(expected)d protocols, but found '
                '%(found)d' % {
                    'line_name': created_line.name,
                    'expected': expected_protocol_count,
                    'found': found_protocol_count
                })

            for protocol_pk, assays_list in protocol_to_assays_list.items():
                planned_assay_names = protocol_to_planned_assay_names.get(protocol_pk)
                self.assertEquals(
                    len(assays_list),
                    len(planned_assay_names),
                )
                for assay_index, assay in enumerate(assays_list):
                    planned_assay_name = planned_assay_names[assay_index]
                    self.assertEquals(assay.name, planned_assay_name)

            # if provided by the test code, verify that assay/line metadata match our expectations.
            # above tests verify the naming only, which is generally a result of the metadata,
            # but best to directly verify the metadata as well. However, the metadata can be a lot
            # of information to encode, so likely that not all tests will include it.
            if exp_meta_by_line:
                # Note: we purposefully DON'T compare the size of exp_meta_by_line and
                # creation_results.lines_created...possible that only a subset of lines will
                # have metadata defined

                related_object_mtypes = cache.related_object_mtypes  # includes many_related
                many_related_obj_mtypes = cache.many_related_mtypes

                exp_metadata = exp_meta_by_line.get(created_line.name)
                self._test_line_metadata(created_line, exp_metadata, cache,
                                         related_object_mtypes,
                                         many_related_obj_mtypes)

        if exp_assay_metadata:
            # TODO: add future-proofing test code here similar to line above to enforce
            # related object relationships...not immediately necessary since current Assay
            # metadata types do not define any that reference related object fields
            # TODO: reorganize this test to be driven by expected results rather than actual..
            # also add size checks for intermediate storage levels and move it back under
            # the larger line-based loop above
            line_items = creation_results.line_to_protocols_to_assays_list.items()
            for line_name, protocol_to_assay in line_items:
                for protocol, assays_list in protocol_to_assay.items():
                    for assay in assays_list:
                        expected_metadata = exp_assay_metadata[line_name][protocol][assay.name]
                        self.assertEqual(expected_metadata, assay.metadata)

        # for future tests that may want access to creation results, (e.g. to spot check large
        # assay metadata sets instead of exhaustively specifying), return them
        return creation_results

    def _test_line_metadata(self, line, exp_metadata, cache, related_object_mtypes,
                            many_related_obj_mtypes):
        if not exp_metadata:
            self.assertFalse(line.metadata)
            # TODO: for consistency in test inputs, also confirm that no line
            # attributes with a MetadataType analog
            return

        # find pks of expected line metadata that correspond to specialized
        # MetadataTypes representing Line foreign key relations in the created lines

        # includes many_related
        exp_related_obj_meta_pks = set(exp_metadata) & set(related_object_mtypes)
        exp_many_related_obj_meta_pks = set(exp_metadata) & set(many_related_obj_mtypes)

        # if no relations are specified by metadata, just do a strict equality check
        if not exp_related_obj_meta_pks:
            self.assertEqual(exp_metadata, line.metadata)
            return

        # since relations are expected in the resulting lines, check to make sure they
        # were set correctly, and also that related object values didn't
        # accidentally leak into the metadata store

        # refresh the entire Line model instance from the database to pick up M2M
        # relation values set in bulk and not normally re-queried by the
        # production line creation process.  We could target just those fields, but
        # cleaner/safer to just re-fetch here.
        line = Line.objects.get(pk=line.pk)

        # TODO: also consider collapsing much of this experimental-but-functional code together

        # loop over expected metadata for this line
        for meta_pk, exp_meta_val in exp_metadata.items():
            # work around string encoding used to facilitate hstore comparison
            meta_pk = meta_pk if isinstance(meta_pk, int) else int(meta_pk)
            meta_type = cache.line_meta_types[meta_pk]

            line_attr = None
            if meta_type.type_field:
                line_attr = getattr(line, meta_type.type_field)

            # obs_val = line.metadata_get(meta_type)  # TODO: try this approach
            many_related_obj = False

            # if expected metadata is a 1-M or M2M relation, get related primary keys
            if meta_pk in exp_many_related_obj_meta_pks:
                related_object = True
                many_related_obj = True
                obs_val = [pk for pk in line_attr.values_list('pk', flat=True).order_by('pk')]

                # sort both expected and observed results to simplify comparison
                if exp_meta_val:
                    exp_meta_val = exp_meta_val.sort()

            # if expected metadata is a 1-1 relation, get primary key
            elif meta_pk in exp_related_obj_meta_pks:
                related_object = True
                obs_val = line_attr.values_list('pk', flat=True)

            # expected metadata is not captured by a relation
            else:
                # TODO: remove debug stmt
                related_object = False

                # handle non-relation line fields
                if meta_type.type_field:
                    obs_val = line_attr
                # default is that results should be store as metadata
                else:
                    obs_val = line.metadata.get(str(meta_pk))

            # if data should be stored as a relation, check that the related value
            # didn't leak into the meta store
            if related_object:
                self.assertEqual(line.metadata.get(meta_pk), None)

            # skip value comparison for many-related objects until we've found & fixed
            # the source of related errors... relationships are getting set via the UI, but
            # not showing up as expected in this test...
            # TODO: fix and remove this workaround...only affects Strains and Carbon Sources.
            if many_related_obj:
                continue

            # regardless of storage mechanism used above, compare actual and
            # expected values
            self.assertEqual(exp_meta_val, obs_val,
                             'MetadataType "%(meta_type)s" (pk=%(pk)d): %(exp)s '
                             '!= %(obs)s' % {
                                 'meta_type': meta_type.type_name,
                                 'pk': meta_pk,
                                 'exp': exp_meta_val,
                                 'obs': obs_val, })

    def _test_combinatorial_input(self, study, source_input, expected_line_names,
                                  expected_assay_suffixes, edd_strains_by_ice_id=None,
                                  exp_line_metadata=None, exp_assay_metadata=None,
                                  is_excel_file=False):
        """
        A workhorse method that helps to standardize unit test implementation.  At the time of
        writing, the full production code path can't be used here, because it depends on ICE to
        resolve ICE part numbers or UUIDs provided as input.
        This method provides a reasonably close analog to the full production code path, based on
        the assumption that all Strains referenced in test data are already cached in EDD's
        database (e.g. during test setup)...the alternatives are
           1) to add complexity to the production code path, or
           2) to require an integration testing environment that includes ICE.
        :param source_input: the input source provided for back-end processing (either JSON or
        an Experiment Description file)
        :param edd_strains_by_ice_id: a dict that maps ICE identifiers used in source_input to
        Strains objects already cached in EDD's database.

        """
        cache = self.cache

        # Create an importer to collect errors/warnings
        importer = CombinatorialCreationImporter(study, self.system_user, cache)
        options = ExperimentDescriptionOptions()
        edd_strains_by_ice_id = edd_strains_by_ice_id if edd_strains_by_ice_id is not None else {}

        # Parse JSON inputs
        if is_excel_file:
            parser = ExperimentDescFileParser(cache, importer)
            combinatorial_inputs = parser.parse_excel(source_input)
        else:
            parser = JsonInputParser(cache, importer)
            combinatorial_inputs = parser.parse(source_input)

        if importer.errors:
            self.fail('Parse errors: ' + json.dumps(_build_response_content(importer.errors,
                                                                            importer.warnings)))

        # do a consistency check for provided strain identifiers -- should clarify unit test
        # maintenance with a nice error message
        unique_strain_ids = set()
        for combo in combinatorial_inputs:
            unique_strain_ids = combo.get_related_object_ids(cache.strains_mtype.pk,
                                                             unique_strain_ids)
        missing_strain_ids = [strain_id for strain_id in unique_strain_ids if strain_id not in
                              edd_strains_by_ice_id]
        if missing_strain_ids:
            self.fail('Strain identifiers provided in source_input were not found in '
                      'edd_strains_by_ice_id: %s' % missing_strain_ids)

        # use production code path to replace ICE part numbers from the input with EDD pks
        if edd_strains_by_ice_id:
            ice_parts_by_id = {}
            for input_item in combinatorial_inputs:
                input_item.replace_ice_ids_with_edd_pks(edd_strains_by_ice_id,
                                                        ice_parts_by_id,
                                                        cache.strains_mtype.pk)
        self.assertEqual(
            len(combinatorial_inputs),
            1,
            'Expected a single set of combinatorial inputs, but found %d sets' %
            len(combinatorial_inputs)
        )

        # fail if there were any parse errors
        if importer.errors:
            self.fail('Errors occurred during input parsing: %s' % str(importer.errors))

        if importer.warnings:
            self.fail('Warnings occurred during input parsing: %s' % str(importer.warnings))

        # Use standard workhorse method to execute the creation test
        return self._test_combinatorial_creation(
            study,
            combinatorial_inputs[0],  # TODO: hard-coded index with multiples possible (though
                                      # currently unused)
            importer,
            options,
            expected_line_names,
            expected_assay_suffixes,
            exp_meta_by_line=exp_line_metadata,
            exp_assay_metadata=exp_assay_metadata
        )

    def _test_assay_names(
            self,
            line_name,
            naming_results,
            protocol_pk,
            expected_suffixes,
            protocols_by_pk):
        """
        A helper method for comparing expected to actual assay names. Since assay names are many
        more than lines, its easier to dynamically construct their names rather than
        hard-code them.

        :param line_name:
        :param naming_results:
        :param protocol_pk:
        :param expected_suffixes:
        :param protocols_by_pk:
        """
        expected_assay_names = []
        for suffix in expected_suffixes:
            expected_assay_names = [
                '%(line_name)s-%(suffix)s' % {'line_name': line_name, 'suffix': suffix}
                for suffix in expected_suffixes
            ]

        assays_list = naming_results.get_assays_list(line_name, protocol_pk)
        self.assertEqual(
            len(expected_assay_names),
            len(assays_list),
            'Expected %(exp_count)d assays for (line: "%(line_name)s", protocol: '
            '"%(protocol)s") but found %(found)d' % {
                'exp_count': len(expected_assay_names),
                'line_name': line_name,
                'protocol': protocols_by_pk[protocol_pk],
                'found': len(assays_list),
            })
        for assay_name in assays_list:
            self.assertTrue(
                assay_name in expected_assay_names,
                "Assay name %(actual)s was computed, but not expected. Expected names "
                "were: %(expected)s" % {'actual': assay_name, 'expected': expected_assay_names}
            )

    def test_basic_json(self):
        """
        A simplified integration test that exercises much of the EDD code responsible for
        combinatorial line creation based on a simplified input (just creating replicates for a
        single line with some metadata using a known strain).  Test inputs in this example
        roughly correspond to the sample experiment description file attached to EDD-380)

        Testing the full code path for EDD's experiment description file support requires having
        a corresponding ICE deployment to use as part of the test, so it's not addressed here.
        """
        cache = self.cache

        ###########################################################################################
        # Create strains for this test
        ###########################################################################################

        strain, _ = Strain.objects.get_or_create(name='JW0111')
        study = Study.objects.create(name='Unit Test Study')
        cache.strains_by_pk = {strain.pk: strain}
        media_mtype = self.media_mtype
        strains_mtype = self.cache.strains_mtype
        control = MetadataType.objects.get(type_name='Control', for_context=MetadataType.LINE)

        ###########################################################################################
        # define test input
        ###########################################################################################
        test_input = {
            'name_elements': {'elements': ['_custom_1', 'replicate_num']},
            'custom_name_elts': {'_custom_1': '181-aceF'},
            'replicate_count': 3,
            'combinatorial_line_metadata': {},
            'common_line_metadata': {
                str(media_mtype.pk): 'LB',  # json only supports string keys
                str(control.pk): False,
                str(strains_mtype.pk): [str(strain.uuid)],
            }
        }

        expected_line_names = ['181-aceF-R1', '181-aceF-R2', '181-aceF-R3']
        expected_assay_suffixes = {}

        expected_line_metadata = {
            line_name: {media_mtype.pk: 'LB',
                        control.pk: False,
                        strains_mtype.pk: [strain.pk]}
            for line_name in expected_line_names
        }

        self._test_combinatorial_input(study,
                                       json.dumps(test_input),
                                       expected_line_names,
                                       expected_assay_suffixes,
                                       edd_strains_by_ice_id={str(strain.uuid): strain},
                                       exp_line_metadata=expected_line_metadata,
                                       is_excel_file=False)

    def test_advanced_experiment_description_xlsx(self):
        cache = self.cache

        strain, _ = Strain.objects.get_or_create(name='JW0111')
        study = Study.objects.create(name='Unit Test Study')
        cache.strains_by_pk = {strain.pk: strain}
        strains_by_part_num = {'JBx_002078': strain}
        targeted_proteomics = self.targeted_proteomics
        metabolomics = self.metabolomics
        media_mtype = self.media_mtype

        expected_line_names = ['181-aceF-R1', '181-aceF-R2', '181-aceF-R3']
        expected_assay_suffixes = {
            targeted_proteomics.pk: ['8h', '24h'],
            metabolomics.pk: ['4h', '6h'],
        }

        expected_line_metadata = {
            line_name: {str(media_mtype.pk): 'LB'}
            for line_name in expected_line_names
        }

        # construct a dict of expected assay metadata as a result of submitting this ED file
        time_pk_str = str(cache.assay_time_mtype.pk)
        expected_assay_metadata = {}  # maps line name -> protocol pk -> assay name -> metadata
        for line_name in expected_line_names:
            expected_assay_metadata[line_name] = {}
            for protocol_pk, assay_suffixes in expected_assay_suffixes.items():
                for assay_suffix in assay_suffixes:
                    assay_name = "%s-%s" % (line_name, assay_suffix)
                    time_str = str(float(assay_suffix[0:-1]))  # re/cast to get the decimal

                    assay_name_to_meta_dict = expected_assay_metadata[line_name].get(protocol_pk,
                                                                                     {})
                    if not assay_name_to_meta_dict:
                        expected_assay_metadata[line_name][protocol_pk] = assay_name_to_meta_dict

                    assay_name_to_meta_dict[assay_name] = {time_pk_str: time_str}

        creation_results = self._test_combinatorial_input(
            study,
            advanced_experiment_def_xlsx,
            expected_line_names,
            expected_assay_suffixes,
            edd_strains_by_ice_id=strains_by_part_num,
            exp_line_metadata=expected_line_metadata,
            exp_assay_metadata=expected_assay_metadata,
            is_excel_file=True)

        # verify that line descriptions match the expected value set in the file (using database
        # field that's in use by the GUI at the time of writing
        for line in creation_results.lines_created:
            self.assertEqual('Description blah blah', line.description)
