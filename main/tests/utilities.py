# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import unittest
from pprint import pprint

from django.test import TestCase

from edd_utils.parsers.experiment_def import JsonInputParser
from main.models import (
    CarbonSource, MetadataType, Protocol, Strain, Study, User)

_SEPARATOR = '******************************************'


# TODO: rename or move this integration testing code elsewhere
class CombinatorialCreationTests(TestCase):
    def setUp(self):
        self.test_user = User.objects.create(username='test_user', email='test_user@example.com')

        self.system_user = User.objects.get(username='system')

        # Note: tests run in a transaction, so these will get removed automatically
        self.proteomics_protocol = Protocol.objects.create(name='Proteomics',
                                                           owned_by=self.system_user)
        self.assay_time = MetadataType.objects.create(type_name='Time',
                                                      for_context=MetadataType.ASSAY)
        self.media_metadata = MetadataType.objects.create(type_name='Media',
                                                          for_context=MetadataType.LINE)

    def test_combinatorial_gui_use_case(self):
        """
        A simplified integration test that exercises much of the EDD code responsible for
        combinatorial line creation based on a typical anticipated use case for the
        planned combinatorial line creation GUI.  Test input here is very similar to that displayed
        in the combinatorial GUI mockup attached to EDD-257.

        Testing the full code path for EDD's template file support requires having a
        corresponding ICE deployment to use as part of the test, so it's not addressed here.
        """

        print()
        print()
        print(_SEPARATOR)
        print('test_combinatorial_gui_use_case')
        print(_SEPARATOR)
        print()

        ############################################################################################
        # Create model objects for use in this test (can likely eventually remove these with
        # migrations/fixtures in place)
        ############################################################################################
        carbon_source_metadata = MetadataType.objects.get_or_create(
                type_name='Carbon Source(s)',
                for_context=MetadataType.LINE)[0]

        # glucose = Metabolite.objects.get_or_create(type_name='Glucose', charge=0,
        #                                            molar_mass=180.15588)[0]
        # galactose = Metabolite.objects.get_or_create(type_name='Galactose', charge=0,
        #                                              molar_mass=180.15590)[0]

        carbon_source_glucose = CarbonSource.objects.get_or_create(name='1% Glucose',
                                                                   volume=10.00000)[0]
        carbon_source_galactose = CarbonSource.objects.get_or_create(name='1% Galactose',
                                                                     volume=50)[0]

        # not currently defined in DB
        metabolomics = Protocol.objects.get_or_create(name='Metabolomics',
                                                      owned_by=self.system_user)[0]

        targeted_proteomics = Protocol.objects.get_or_create(name='Targeted Proteomics',
                                                             owned_by=self.system_user)[0]

        growth_temp_meta = MetadataType.objects.get_or_create(type_name='Growth Temperature',
                                                              for_context=MetadataType.LINE)[0]

        ############################################################################################
        # Create non-standard objects to use as the basis for this test
        ############################################################################################
        strain1 = Strain.objects.create(name='JW1058')
        strain2 = Strain.objects.create(name='JW5327')

        print(carbon_source_metadata)

        print('Carbon source type: pk=%(pk)d: %(carbon_source)s' % {
            'pk': carbon_source_metadata.pk,
            'carbon_source': carbon_source_metadata,
        })

        ############################################################################################
        # Define JSON test input
        ############################################################################################

        # working carbon source (via metadata) example
        gui_mockup_example = {  # TODO: replace string literals with constants
            'name_elements': {
                'elements': ['strain_name',
                             self.media_metadata.pk,
                             carbon_source_metadata.pk,
                             'replicate'],

                'abbreviations': {
                    'strain_name': {
                        strain1.name: 58,
                        strain2.name: 27,
                    },
                    # NOTE: for starters, we're using the MetadataType representation for carbon
                    # source as a proof-of-concept for
                    carbon_source_metadata.pk: {
                        carbon_source_glucose.name: 'GLU',
                        carbon_source_galactose.name: 'GAL',
                    }
                }
            }, 'replicate_count': 3,
#            'contact': 4,  # TODO: implement/test
            'combinatorial_strain_id_groups': [[strain1.pk], [strain2.pk]],
            'common_line_metadata': {
                growth_temp_meta.pk: 30,  # degrees C
            }, 'combinatorial_line_metadata': {
                self.media_metadata.pk: ['EZ', 'LB'],  # media
                carbon_source_metadata.pk: ['1% Glucose', '1% Galactose'],
            }, 'protocol_to_combinatorial_metadata': {
                targeted_proteomics.pk: {
                    self.assay_time.pk: [8, 24],  # hours
                },
                metabolomics.pk: {
                    self.assay_time.pk: [4, 6]  # hours
                },
            },
        }

        study = Study.objects.create(name='Unit Test Study')
        expected_line_names = ['58-EZ-GLU-1', '58-EZ-GLU-2', '58-EZ-GLU-3', '58-EZ-GAL-1',
                               '58-EZ-GAL-2', '58-EZ-GAL-3', '58-LB-GLU-1', '58-LB-GLU-2',
                               '58-LB-GLU-3', '58-LB-GAL-1', '58-LB-GAL-2', '58-LB-GAL-3',
                               '27-EZ-GLU-1', '27-EZ-GLU-2', '27-EZ-GLU-3', '27-EZ-GAL-1',
                               '27-EZ-GAL-2', '27-EZ-GAL-3', '27-LB-GLU-1', '27-LB-GLU-2',
                               '27-LB-GLU-3', '27-LB-GAL-1', '27-LB-GAL-2', '27-LB-GAL-3', ]

        expected_assay_suffixes = {
            targeted_proteomics.pk: ['8h', '24h'],
            metabolomics.pk: ['4h', '6h'],
        }

        strains_by_pk = {
            strain1.pk: strain1, strain2.pk: strain2,
        }

        self._test_combinatorial_json_creation(study, gui_mockup_example, expected_line_names,
                                               expected_assay_suffixes, strains_by_pk)

    def _test_combinatorial_creation(self, study, combinatorial_inputs, expected_line_names,
                                     expected_protocols_to_assay_suffixes, strains_by_pk,
                                     protocols_by_pk=None, line_metadata_types=None,
                                     assay_metadata_types=None):

        if protocols_by_pk is None:
            protocols_by_pk = {protocol.pk: protocol for protocol in Protocol.objects.all()}

        if line_metadata_types is None:
            line_metadata_types = {meta.pk: meta for meta in
                                   MetadataType.objects.filter(for_context=MetadataType.LINE)}

        if assay_metadata_types is None:
            assay_metadata_types = {meta.pk: meta for meta in
                                    MetadataType.objects.filter(for_context=MetadataType.ASSAY)}

        print('Line metadata types:')
        pprint(line_metadata_types)

        print(_SEPARATOR)
        print('Testing line/assay naming (prior to creation)')
        print(_SEPARATOR)

        ############################################################################################
        # compute / verify line/assay names first before actually performing the creation.
        ############################################################################################

        # This name preview capability will support the eventual combinatorial line creation GUI
        # (EDD-257)

        for index, inputs in enumerate(combinatorial_inputs):
            print('Combinatorial Inputs %d' % (index + 1))
            pprint(vars(inputs))

            naming_results = inputs.compute_line_and_assay_names(study, protocols_by_pk,
                                                                 line_metadata_types,
                                                                 assay_metadata_types,
                                                                 strains_by_pk)

            planned_line_count = len(naming_results.line_names)
            print('Lines created: %d' % len(naming_results.line_names))

            for line_index, line_name in enumerate(naming_results.line_names):
                print('Line %(num)d: %(name)s' % {
                    'num': line_index + 1, 'name': line_name,
                })

                if naming_results.line_to_protocols_to_assays_list:
                    for protocol_pk, assays_list in (
                            naming_results.line_to_protocols_to_assays_list[line_name].items()):
                        print('\tProtocol %s:' % protocols_by_pk.get(protocol_pk))
                        for assay_name in assays_list:
                            print('\t\tAssay %s' % assay_name)

            # verify planned line names, while tolerating ordering differences in dict use as a
            # result of parsing
            self.assertEqual(len(naming_results.line_names), len(expected_line_names))
            for planned_line_name in naming_results.line_names:
                self.assertTrue(planned_line_name in expected_line_names,
                                "Line name %s wasn't expected" % planned_line_name)

            print('Naming results')
            pprint(vars(naming_results))

            for line_name in expected_line_names:
                for protocol_pk, exp_suffixes in \
                        expected_protocols_to_assay_suffixes.items():
                    self._test_assay_names(line_name, naming_results, protocol_pk,
                                           exp_suffixes, protocols_by_pk)

        ############################################################################################
        # Test actual line/assay creation, verifying it matches the preview computed above
        ############################################################################################
        print(_SEPARATOR)
        print('Testing line/assay creation')
        print(_SEPARATOR)

        for index, inputs in enumerate(combinatorial_inputs):
            print('Combinatorial Inputs %d' % (index + 1))
            pprint(vars(inputs))

            creation_results = inputs.populate_study(study, protocols_by_pk,
                                                     line_metadata_types, assay_metadata_types,
                                                     strains_by_pk)

            created_line_count = len(creation_results.lines_created)
            print('Lines created: %d' % len(creation_results.lines_created))

            pprint(vars(creation_results))

            self.assertEqual(created_line_count, planned_line_count)

            for line_index, created_line in enumerate(creation_results.lines_created):
                print('Line %(num)d: %(name)s' % {
                    'num': line_index, 'name': created_line.name,
                })

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

                self.assertEqual(len(protocol_to_assays_list),
                                 len(protocol_to_planned_assay_names))

                expected_protocol_count = len(protocol_to_planned_assay_names)
                found_protocol_count = len(protocol_to_assays_list)
                self.assertEqual(found_protocol_count, expected_protocol_count,
                                 'For line %(line_name)s, expected assays for %(expected)d '
                                 'protocols, but found %(found)d' % {
                                     'line_name': created_line.name,
                                     'expected': expected_protocol_count,
                                     'found': found_protocol_count
                                 })

                for protocol_pk, assays_list in protocol_to_assays_list.items():

                    planned_assay_names = protocol_to_planned_assay_names.get(protocol_pk)

                    self.assertEquals(len(assays_list), len(planned_assay_names))

                    print('\tProtocol %s:' % protocols_by_pk.get(protocol_pk))
                    for assay_index, assay in enumerate(assays_list):
                        planned_assay_name = planned_assay_names[assay_index]
                        print('\t\tAssay %s' % assay.name)
                        self.assertEquals(assay.name, planned_assay_name)

         # TODO: test resulting assay metadata. Probably sufficient for now to do this in the UI,
         # since it's likely to be noticed if it doesn't work as expected

    def _test_combinatorial_json_creation(self, study, json_input, expected_line_names,
                                          expected_assay_suffixes, strains_by_pk):

        """ A helper/workhorse method for testing combinatorial line/assay creation. """

        ############################################################################################
        # If not provided by client, query the database for metadata types relevant to this test
        ############################################################################################

        # for now, these will just be the ones defined above, though we may eventually get a basic
        # set from migrations (EDD-506). After that, we can likely delete the above code to create
        # standard model objects.
        protocols_by_pk = {protocol.pk: protocol for protocol in Protocol.objects.all()}

        line_metadata_types = {meta.pk: meta for meta in
                               MetadataType.objects.filter(for_context=MetadataType.LINE)}

        assay_metadata_types = {meta.pk: meta for meta in
                                MetadataType.objects.filter(for_context=MetadataType.ASSAY)}

        print(_SEPARATOR)
        print('Testing input parsing')
        print(_SEPARATOR)

        from pprint import pprint
        pprint(json_input)

        # Parse JSON inputs
        parser = JsonInputParser(protocols_by_pk, line_metadata_types, assay_metadata_types)
        errors = {}
        warnings = {}
        combinatorial_inputs = parser.parse(json.dumps(json_input), errors, warnings)

        # fail if there were any parse errors
        if errors:
            from pprint import pprint
            print('Errors encountered during parsing:')
            pprint(errors)

            self.fail('Errors occurred during JSON parsing')

        # Use standard workhorse method to execute the creation test
        self._test_combinatorial_creation(
                study, combinatorial_inputs, expected_line_names,
                expected_assay_suffixes, strains_by_pk, protocols_by_pk,
                line_metadata_types, assay_metadata_types)

    def _test_assay_names(self, line_name, naming_results, protocol_pk, expected_suffixes,
                          protocols_by_pk):
        """
        A helper method for comparing expected to actual assay names. Since assay names are many
        more than lines, its easier to dynamically construct their names rather than hard-code them.
        :param line_name:
        :param expected_suffixes:
        :return:
        """
        expected_assay_names = []
        for suffix in expected_suffixes:
            expected_assay_names = ['%(line_name)s-%(suffix)s' % {
                    'line_name': line_name,
                    'suffix': suffix}
                    for suffix in expected_suffixes]

        assays_list = naming_results.get_assays_list(line_name, protocol_pk)
        self.assertEqual(len(expected_assay_names), len(assays_list),
                         'Expected %(exp_count)d assays for (line: "%(line_name)s", protocol: '
                         '"%(protocol)s") but found '
                         '%(found)d' % {
                            'exp_count': len(expected_assay_names),
                            'line_name': line_name,
                            'protocol': protocols_by_pk[protocol_pk],
                            'found': len(assays_list),
                         })
        for assay_name in assays_list:
            self.assertTrue(assay_name in expected_assay_names, "Assay name %(actual)s was "
                                                                "computed, "
                                                                "but not expected. Expected "
                                                                "names were: %(expected)s" %
                            {'actual': assay_name, 'expected': expected_assay_names})

    def test_basic_json(self):
        """
        A simplified integration-level test that exercises much of the EDD code responsible for
        combinatorial line creation based on a simplified input (just creating replicates for a
        single line with some metadata using a known strain).  Test inputs in this example
        roughly correspend to the sample template file attached to EDD-380)2

        Testing the full code path for EDD's
        template file support requires having a corresponding ICE deployment to use as part of
        the test, so it's not addressed here. """

        print()
        print()
        print(_SEPARATOR)
        print('test_basic_json')
        print(_SEPARATOR)
        print()

        ############################################################################################
        # Create strains for this test
        ############################################################################################

        strain = Strain.objects.create(name='JW0111')
        study = Study.objects.create(name='Unit Test Study')
        strains_by_pk = {strain.pk: strain}

        ############################################################################################
        # define test input
        ############################################################################################
        test_input = {  # TODO: replace string literals with constants
            'base_name': '181-aceF',
            'replicate_count': 3,
            'desc': '181 JW0111 aceF R1',
            'is_control': [False],
            # Note: normal use is to provide part numbers / look them up in ICE. We're skipping
            # that step here
            'combinatorial_strain_id_groups': [strain.pk],
            # 'combinatorial_line_metadata': {},
            'common_line_metadata': {
                str(self.media_metadata.pk): ['LB'],  # json only supports string keys
            }
        }

        expected_line_names = ['181-aceF-R1', '181-aceF-R2', '181-aceF-R3']
        expected_assay_suffixes = {}

        self._test_combinatorial_json_creation(study, test_input, expected_line_names,
                                               expected_assay_suffixes, strains_by_pk)

