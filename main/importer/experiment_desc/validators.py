from __future__ import unicode_literals

from jsonschema import Draft4Validator

"""
A work-in-progress attempt to do validation on the complex JSON input for the combinatorial line
creation GUI. Validating the (potentially complex) input should help to simplify custom code and
related error diagnosis while also providing detailed user feedback on what was wrong.

This early attempt worked (including with the unit test code committed at the time), but shouldn't
have.  I abandoned further changes here because of time constraints.  If resuming this effort,
see the TODO below for 'additionalProperties': False, which should cause the unit test to fail.

At this point, it's unclear whether the jsonschema library is trustworthy (maybe just not the
case for Python 2?) or whether there's an error here in hurredly interpreting the (not great)
documentation.
Also worth noting that a supporing Python 3.2 library seems to have gotten pulled into the
requirements by jsonschema (which claims to support Python 2 and 3).  Consider untangling all this
later...for now, just don't import/use this code.

Early testing of this version was done against the following requirements (purposefully omitted 
from EDD's requirements.txt for now):

jsonschema==2.5.1
functools32==3.2.3.post2
"""


class JsonSchemaValidator(object):
    def validate(self, input, errors):
        # TODO: continue testing this in support of the combinatorial line creation GUI. This
        # schema allows automated tests to work, but doesn't include many of the items drafted
        # below that should also be tested/included.  Suspected culprit ATM is that jsonschema
        # library doesn't support the spec as advertised.
        schema = {
            "$schema": "http://json-schema.org/draft-04/schema#",
            'id': 'http://www.jbei.org/schemas/informatics/edd/combinatorial_definition.json',
            'description': 'Defines a repsesentation for combinatioral line/assay creation by the '
                           'EDD',
            # 'definitions': {
            #     'input': {
            #         'type': 'object',
            'properties': {
                #     'oneOf': [
                # {
                'base_name': {
                    'type': 'string',
                },  # },
                # {
                #     'name_elements': {
                #         'type': 'object',
                #         'properties': {
                #             _AutomatedNamingStrategy.ELEMENTS: {
                #                 'type': 'array', 'items': {
                #                     'enum': str(auto_naming_strategy.valid_items),
                #                 }
                #             },
                #             _AutomatedNamingStrategy.CUSTOM_ADDITIONS: {
                #                     'type': 'array',
                #                     'items': {
                #                         'type': 'object',
                #                         'properties': {
                #                             'label': {
                #                                 'type': 'string'},
                #                             'value': {
                #                                 'type': 'string'}}}},
                #             _AutomatedNamingStrategy.ABBREVIATIONS: {
                #                     'type': 'object',
                #                     'additionalProperties': {  # element-related defs
                #                         'type': 'object',
                #                         'additionalProperties': {  # value -> abbreviation map
                #                             'type': ['string', 'integer']
                #                         },
                #                     }
                #             },
                #
                #         }, 'required': [_AutomatedNamingStrategy.ELEMENTS]},}],
                # NOTE: 'description' as in our models is a reserved keyword for jsonschema
                'desc': {
                    'type': 'string',
                }, 'is_control': {
                    'type': 'array',
                    # TODO: implication is that this should work, but no specific examples found
                    #  yet that use 'boolean' for 'items'/using jsonschema library
                    # 'items': 'boolean',

                    'uniqueItems': True, 'maxItems': 2,
                }, 'combinatorial_strain_id_groups': {
                    'type': 'array', 'items': [{'$ref': '#/definitions/strain_id'},
                                               {'$ref': '#/definitions/strain_id_group'}]
                }, 'replicate_count': {
                    'type': 'integer', 'minimum': 1,
                }, 'common_line_metadata': {
                    'type': 'object', 'additionalProperties': {
                        'type': 'array',
                    }
                }, 'combinatorial_line_metadata': {
                    'type': 'object', 'additionalProperties': {
                        'type': 'array',
                    }
                }, 'protocol_to_assay_metadata': {
                    "$ref": "#/definitions/protocol_to_assay_metadata_map"
                },  # 'protocol_to_combinatorial_metadata': {
                #     "$ref": "#/definitions/protocol_to_assay_metadata_map"
                # },
                'contact': {
                    'type': 'string'
                }, 'experimenter': {
                    'type': 'string'
                }, 'carbon_source': {
                    'type': 'integer'
                },
                #             'additionalProperties': False, #},  #

                # 'protocol_to_assay_metadata_map': {
                #     'type': 'object',
                #     'additionalProperties': {  # per-protocol dict
                #             'type': 'object',
                #             'additionalProperties': {  # metadata-specific values
                #                 'oneOf': [  # metadata values list (or single item)
                #                     {
                #                         'type': 'array', 'items': ['string', 'number'],
                #                     }, {
                #                         'type': ['string', 'number']
                #                     }]
                #             }
                #         },
                # },

                # },
                #     },
            }, 'additionalProperties': False,  # TODO: not being applied!!
            'definitions': {
                'strain_id': {
                    'type': ['integer', 'string'],
                }, 'strain_id_group': {
                    'type': 'array', 'items': {'$ref': '#/definitions/strain_id'},
                    'line_metadata_map': {
                        'type': 'object', 'additionalProperties': {  # metadata-specific values
                            'oneOf': [  # metadata values list (or single item)
                                {
                                    'type': 'array', 'items': ['string', 'number'],
                                }, {
                                    'type': ['string', 'number']
                                }]
                        }
                    },
                },
            },

            # 'oneOf': [
            #     {'$ref': '#/definitions/input'},
            #     {
            #         'type': 'array',
            #         'items': {'$ref': '#/definitions/input'},
            #
            #     }
            # ],

        }

        # try to validate the JSON input against the schema (essentially verifies formatting /
        # non-key datatypes only)
        # try:
        Draft4Validator.check_schema(schema)  # TODO: move to a unit test
        validator = Draft4Validator(schema)
        validator.validate(input)
        validation_errors = validator.iter_errors(input)
        for err in validation_errors:
            print(str(err))
            self.add_parse_error(errors, err.message, '.'.join(list(err.absolute_path)))

        # jsonschema.validate(parsed_json, schema)
        # except ValidationError as v_err:
        #     self.add_parse_error(errors, str(v_err))
        #     return None
