# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import os

from builtins import str
from collections import defaultdict
from django.contrib.auth import get_user_model
from django.contrib.staticfiles.storage import staticfiles_storage
from django.test import tag, TestCase
from openpyxl import load_workbook

from main.importer.experiment_desc import CombinatorialCreationImporter
from main.importer.experiment_desc.constants import (STRAIN_NAME_ELT, REPLICATE_ELT,
                                                     ELEMENTS_SECTION, ABBREVIATIONS_SECTION,
                                                     BASE_NAME_ELT)
from main.importer.experiment_desc.parsers import ExperimentDescFileParser, JsonInputParser
from main.models import (CarbonSource, MetadataType, Protocol, Strain, Study)


User = get_user_model()
main_dir = os.path.dirname(__file__),
fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fixtures_dir = os.path.join(fixtures_dir, 'fixtures')
advanced_experiment_def_xlsx = os.path.join(fixtures_dir, 'advanced_experiment_description.xlsx')


class CombinatorialCreationTests(TestCase):
    """
    Defines automated integration tests for most of the supporting back-end code for experiment
    description file upload and combinatorial line creation (processes are very similar/based on
    the same code)
    """

    @classmethod
    def setUpTestData(cls):
        cls.system_user = User.objects.get(username='system')
        Protocol.objects.get_or_create(name='Proteomics', owned_by=cls.system_user)
        Protocol.objects.get_or_create(name='Metabolomics', owned_by=cls.system_user)
        Protocol.objects.get_or_create(name='Targeted Proteomics', owned_by=cls.system_user)
        MetadataType.objects.get_or_create(type_name='Time', for_context=MetadataType.ASSAY)
        MetadataType.objects.get_or_create(type_name='Media', for_context=MetadataType.LINE)

    def test_combinatorial_gui_use_case(self):
        """
        A simplified integration test that exercises much of the EDD code responsible for
        combinatorial line creation based on a typical anticipated use case for the
        planned combinatorial line creation GUI.  Test input here is very similar to that displayed
        in the combinatorial GUI mockup attached to EDD-257. Note that this test doesn't actually
        verify the line/assay metadata since that requires a lot more code

        Testing the full code path for EDD's experiment description file support requires having a
        corresponding ICE deployment to use as part of the test, so it's not addressed here.
        """

        ###########################################################################################
        # Load model objects for use in this test
        ###########################################################################################
        carbon_source_meta = MetadataType.objects.get(
            type_i18n='main.models.Line.carbon_source'
        )
        growth_temp_meta = MetadataType.objects.get(
            type_i18n='main.models.Line.Growth_temperature'
        )
        media_meta = MetadataType.objects.get(type_name='Media', for_context=MetadataType.LINE)
        time_meta = MetadataType.objects.get(type_name='Time', for_context=MetadataType.ASSAY)

        carbon_source_glucose, _ = CarbonSource.objects.get_or_create(
            name=r'1% Glucose',
            volume=10.00000
        )
        carbon_source_galactose, _ = CarbonSource.objects.get_or_create(
            name=r'1% Galactose',
            volume=50
        )

        targeted_proteomics = Protocol.objects.get(
            name='Targeted Proteomics',
            owned_by=self.system_user
        )
        metabolomics = Protocol.objects.get(name='Metabolomics', owned_by=self.system_user)

        ###########################################################################################
        # Create non-standard objects to use as the basis for this test
        ###########################################################################################
        strain1 = Strain.objects.create(name='JW1058')
        strain2 = Strain.objects.create(name='JW5327')

        ###########################################################################################
        # Define JSON test input
        ###########################################################################################

        LB = 'LB'
        EZ = 'EZ'
        GLU = r'1% Glucose'
        GAL = r'1% Galactose'

        # working carbon source (via metadata) example
        gui_mockup_example = {  # TODO: replace string literals with constants
            'name_elements': {
                ELEMENTS_SECTION: [
                    STRAIN_NAME_ELT,
                    media_meta.pk,
                    carbon_source_meta.pk,
                    REPLICATE_ELT
                ],
                ABBREVIATIONS_SECTION: {
                    STRAIN_NAME_ELT: {
                        strain1.name: 58,
                        strain2.name: 27,
                    },
                    carbon_source_meta.pk: {
                        carbon_source_glucose.name: 'GLU',
                        carbon_source_galactose.name: 'GAL',
                    }
                }
            },
            'replicate_count': 3,
            # 'contact': 4,  # TODO: implement/test
            'combinatorial_strain_id_groups': [[strain1.pk], [strain2.pk]],
            'common_line_metadata': {
                growth_temp_meta.pk: 30,  # degrees C
            },
            'combinatorial_line_metadata': {
                media_meta.pk: ['EZ', 'LB'],  # media
                carbon_source_meta.pk: [GAL, GLU],
            },
            'protocol_to_combinatorial_metadata': {
                targeted_proteomics.pk: {
                    time_meta.pk: [8, 24],  # hours
                },
                metabolomics.pk: {
                    time_meta.pk: [4, 6]  # hours
                },
            },
        }

        ###########################################################################################
        # Expected results of the test
        ###########################################################################################
        expected_line_names = [
            '58-EZ-GLU-1', '58-EZ-GLU-2', '58-EZ-GLU-3',
            '58-EZ-GAL-1', '58-EZ-GAL-2', '58-EZ-GAL-3',
            '58-LB-GLU-1', '58-LB-GLU-2', '58-LB-GLU-3',
            '58-LB-GAL-1', '58-LB-GAL-2', '58-LB-GAL-3',
            '27-EZ-GLU-1', '27-EZ-GLU-2', '27-EZ-GLU-3',
            '27-EZ-GAL-1', '27-EZ-GAL-2', '27-EZ-GAL-3',
            '27-LB-GLU-1', '27-LB-GLU-2', '27-LB-GLU-3',
            '27-LB-GAL-1', '27-LB-GAL-2', '27-LB-GAL-3',
        ]

        # expected line metadata (as all strings at the line level to match hstore field of created
        # model objects)
        media_pk = str(media_meta.pk)
        temp_pk = str(growth_temp_meta.pk)
        carbon_source_pk = str(carbon_source_meta.pk)

        temp = str(30)
        ez_glu = {carbon_source_pk: GLU, media_pk: EZ, temp_pk: temp}
        ez_gal = {carbon_source_pk: GAL, media_pk: EZ, temp_pk: temp}
        lb_glu = {carbon_source_pk: GLU, media_pk: LB, temp_pk: temp}
        lb_gal = {carbon_source_pk: GAL, media_pk: LB, temp_pk: temp}

        expected_line_metadata = {
            '58-EZ-GLU-1': ez_glu,
            '58-EZ-GLU-2': ez_glu,
            '58-EZ-GLU-3': ez_glu,
            '58-EZ-GAL-1': ez_gal,
            '58-EZ-GAL-2': ez_gal,
            '58-EZ-GAL-3': ez_gal,
            '58-LB-GLU-1': lb_glu,
            '58-LB-GLU-2': lb_glu,
            '58-LB-GLU-3': lb_glu,
            '58-LB-GAL-1': lb_gal,
            '58-LB-GAL-2': lb_gal,
            '58-LB-GAL-3': lb_gal,
            '27-EZ-GLU-1': ez_glu,
            '27-EZ-GLU-2': ez_glu,
            '27-EZ-GLU-3': ez_glu,
            '27-EZ-GAL-1': ez_gal,
            '27-EZ-GAL-2': ez_gal,
            '27-EZ-GAL-3': ez_gal,
            '27-LB-GLU-1': lb_glu,
            '27-LB-GLU-2': lb_glu,
            '27-LB-GLU-3': lb_glu,
            '27-LB-GAL-1': lb_gal,
            '27-LB-GAL-2': lb_gal,
            '27-LB-GAL-3': lb_gal,
        }

        # expected assay metadata (4 assays per line!)
        # (as all strings  at the assay level to match hstore field of created model objects)
        time_pk = str(time_meta.pk)
        assay_metadata = {
            targeted_proteomics.pk: [{time_pk: '8'}, {time_pk: '24'}],
            metabolomics.pk: [{time_pk: '4'}, {time_pk: '6'}, ]
        }

        expected_assay_metadata = {}
        for line_name in expected_line_names:
            protocol_to_assay_to_meta = {}
            expected_assay_metadata[line_name] = protocol_to_assay_to_meta
            for protocol_pk, assay_meta in assay_metadata.iteritems():
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

        strains_by_pk = {
            strain1.pk: strain1, strain2.pk: strain2,
        }

        study = Study.objects.create(name='Unit Test Study')

        self._test_combinatorial_input(
            study,
            json.dumps(gui_mockup_example),
            expected_line_names,
            expected_assay_suffixes,
            strains_by_pk,
            expected_line_metadata=expected_line_metadata,
            expected_assay_metadata=expected_assay_metadata
        )

    def _test_combinatorial_creation(
            self,
            study,
            combo_input,
            expected_line_names,
            expected_protocols_to_assay_suffixes,
            strains_by_pk,
            protocols_by_pk=None,
            line_metadata_types=None,
            assay_metadata_types=None,
            expected_line_metadata=None,
            expected_assay_metadata=None):

        if protocols_by_pk is None:
            protocols_by_pk = {protocol.pk: protocol for protocol in Protocol.objects.all()}

        if line_metadata_types is None:
            line_metadata_types = {
                meta.pk: meta
                for meta in MetadataType.objects.filter(for_context=MetadataType.LINE)
            }

        if assay_metadata_types is None:
            assay_metadata_types = {
                meta.pk: meta
                for meta in MetadataType.objects.filter(for_context=MetadataType.ASSAY)
            }

        ###########################################################################################
        # compute / verify line/assay names first before actually performing the creation.
        ###########################################################################################

        # This name preview capability will support the eventual combinatorial line creation GUI
        # (EDD-257)

        naming_results = combo_input.compute_line_and_assay_names(
            study,
            line_metadata_types,
            assay_metadata_types,
            strains_by_pk
        )

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
            for protocol_pk, exp_suffixes in expected_protocols_to_assay_suffixes.iteritems():
                self._test_assay_names(
                    line_name,
                    naming_results,
                    protocol_pk,
                    exp_suffixes,
                    protocols_by_pk
                )
            if not expected_protocols_to_assay_suffixes:
                self.assertFalse(
                    naming_results.line_to_protocols_to_assays_list.get(line_name, False),
                )

        ###########################################################################################
        # Test actual line/assay creation, verifying it matches the preview computed above
        ###########################################################################################
        creation_results = combo_input.populate_study(
            study,
            line_metadata_types,
            assay_metadata_types,
            strains_by_pk
        )

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

            for protocol_pk, assays_list in protocol_to_assays_list.iteritems():
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
            if expected_line_metadata:
                for line in creation_results.lines_created:
                    expected_metadata = expected_line_metadata.get(line.name)
                    self.assertEqual(expected_metadata, line.meta_store)

            if expected_assay_metadata:
                line_items = creation_results.line_to_protocols_to_assays_list.iteritems()
                for line_name, protocol_to_assay in line_items:
                    for protocol, assays_list in protocol_to_assay.iteritems():
                        for assay in assays_list:
                            expected_metadata = expected_assay_metadata[line_name][protocol][
                                assay.name]
                            self.assertEqual(expected_metadata, assay.meta_store)

        # for future tests that may want access to creation results, (e.g. to spot check large
        # assay metadata sets instead of exhaustively specifying), return them
        return creation_results

    def _test_combinatorial_input(self, study, source_input, expected_line_names,
                                  expected_assay_suffixes, strains_by_pk,
                                  strains_by_part_number=None, expected_line_metadata=None,
                                  expected_assay_metadata=None, is_excel_file=False):

        # for now, these will just be the ones by client code, though we may eventually get a basic
        # set from migrations (EDD-506). After that, we can likely delete the above code to create
        # standard model objects.
        protocols_by_pk = {protocol.pk: protocol for protocol in Protocol.objects.all()}
        line_metadata_types = {
            meta.pk: meta
            for meta in MetadataType.objects.filter(for_context=MetadataType.LINE)
        }
        assay_metadata_types = {
            meta.pk: meta
            for meta in MetadataType.objects.filter(for_context=MetadataType.ASSAY)
        }

        # Parse JSON inputs
        if is_excel_file:
            source_input = load_workbook(source_input, read_only=True, data_only=True)
            parser = ExperimentDescFileParser(protocols_by_pk, line_metadata_types,
                                              assay_metadata_types)
        else:
            parser = JsonInputParser(protocols_by_pk, line_metadata_types, assay_metadata_types)

        # Creating an importer to collect errors/warnings
        importer = CombinatorialCreationImporter(study, self.system_user)
        combinatorial_inputs = parser.parse(source_input, importer)

        # if ICE part numbers were provided by the test, use them to find the corresponding EDD
        # strains
        if strains_by_part_number:
            ice_parts_by_number = {}  # TODO: short-circuiting consistency check in this code block
            for input_item in combinatorial_inputs:
                input_item.replace_strain_part_numbers_with_pks(importer,
                                                                strains_by_part_number,
                                                                ice_parts_by_number)

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
            combinatorial_inputs[0],
            expected_line_names,
            expected_assay_suffixes,
            strains_by_pk,
            protocols_by_pk,
            line_metadata_types,
            assay_metadata_types,
            expected_line_metadata,
            expected_assay_metadata
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

        ###########################################################################################
        # Create strains for this test
        ###########################################################################################

        strain, _ = Strain.objects.get_or_create(name='JW0111')
        study = Study.objects.create(name='Unit Test Study')
        strains_by_pk = {strain.pk: strain}
        media_meta = MetadataType.objects.get(type_name='Media', for_context=MetadataType.LINE)
        time = MetadataType.objects.get(type_name='Time', for_context=MetadataType.ASSAY)

        ###########################################################################################
        # define test input
        ###########################################################################################
        test_input = {
            BASE_NAME_ELT: '181-aceF',
            'replicate_count': 3,
            'desc': '181 JW0111 aceF R1',
            'is_control': [False],
            # Note: normal use is to provide part numbers / look them up in ICE. We're skipping
            # that step here
            'combinatorial_strain_id_groups': [[strain.pk]],
            # 'combinatorial_line_metadata': {},
            'common_line_metadata': {
                str(media_meta.pk): 'LB',  # json only supports string keys
            }
        }

        expected_line_names = ['181-aceF-R1', '181-aceF-R2', '181-aceF-R3']
        expected_assay_suffixes = {}

        expected_line_metadata = {
            line_name: {str(media_meta.pk): 'LB'}
            for line_name in expected_line_names
        }

        self._test_combinatorial_input(
            study,
            json.dumps(test_input),
            expected_line_names,
            expected_assay_suffixes,
            strains_by_pk,
            expected_line_metadata=expected_line_metadata,
            is_excel_file=False,
        )

    def test_advanced_experiment_description_xlsx(self):

        strain, _ = Strain.objects.get_or_create(name='JW0111')
        study = Study.objects.create(name='Unit Test Study')
        strains_by_pk = {strain.pk: strain}
        strains_by_part_number = {'JBx_002078': strain}
        targeted_proteomics = Protocol.objects.get(name='Targeted Proteomics')
        metabolomics = Protocol.objects.get(name='Metabolomics')
        media_meta = MetadataType.objects.get(type_name='Media', for_context=MetadataType.LINE)
        time_meta = MetadataType.objects.get(type_name='Time', for_context=MetadataType.ASSAY)

        expected_line_names = ['181-aceF-R1', '181-aceF-R2', '181-aceF-R3']
        expected_assay_suffixes = {
            targeted_proteomics.pk: ['8h', '24h'],
            metabolomics.pk: ['4h', '6h'],
        }

        expected_line_metadata = {
            line_name: {str(media_meta.pk): u'LB'}
            for line_name in expected_line_names
        }

        # construct a dict of expected assay metadata as a result of submitting this ED file
        time_pk_str = str(time_meta.pk)
        expected_assay_metadata = {}  # maps line name -> protocol pk -> assay name -> metadata
        for line_name in expected_line_names:
            expected_assay_metadata[line_name] = {}
            for protocol_pk, assay_suffixes in expected_assay_suffixes.iteritems():
                for assay_suffix in assay_suffixes:
                    assay_name = "%s-%s" % (line_name, assay_suffix)
                    time_str = str(float(assay_suffix[0:-1]))  # re/cast to get the decimal

                    assay_name_to_meta_dict = expected_assay_metadata[line_name].get(protocol_pk,
                                                                                     {})
                    if not assay_name_to_meta_dict:
                        expected_assay_metadata[line_name][protocol_pk] = assay_name_to_meta_dict

                    assay_name_to_meta_dict[assay_name] = {time_pk_str: time_str}

        creation_results = self._test_combinatorial_input(
                study, advanced_experiment_def_xlsx, expected_line_names, expected_assay_suffixes,
                strains_by_pk, strains_by_part_number, expected_line_metadata,
                expected_assay_metadata=expected_assay_metadata,
                is_excel_file=True)

        # verify that line descriptions match the expected value set in the file (using database
        # field that's in use by the GUI at the time of writing
        for line in creation_results.lines_created:
            self.assertEqual('Description blah blah', line.description)
