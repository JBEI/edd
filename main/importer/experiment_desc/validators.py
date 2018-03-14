# coding: utf-8
"""
A JSON schema for the for the combinatorial line creation GUI. Validating the (potentially
complex) input should help to simplify custom parsing code and related error diagnosis while
also providing detailed user feedback on what was wrong.
"""

SCHEMA = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    'type': 'object',
    'properties': {
        'replicate_count': {
            'type': 'integer', 'minimum': 1,
        },
        'name_elements': {
            'type': 'object',
            'properties': {
                'elements': {
                    'type': 'array',
                    'items': {
                        'type': ['number', 'string'],
                    }
                },
                'abbreviations': {
                    'type': 'object',
                },
            },
            'additionalProperties': {
                'type': 'array',
            }
        },
        'common_line_metadata': {
            'type': 'object',
            'additionalProperties': {
                'type': ['array', 'string', 'number', 'boolean'],
            }
        }, 'combinatorial_line_metadata': {
            'type': 'object',
            'additionalProperties': {
                'type': 'array',
                'items': {
                    'type': ['array', 'number', 'string', 'boolean'],
                }
            }
        },
        'custom_name_elts': {
            'type': 'object',
        },
        'protocol_to_combinatorial_metadata': {
            'type': 'object',
            'additionalProperties': {
                'type': 'object',
                'additionalProperties': {
                    'type': 'array',
                    'items': {
                        'type': ['string', 'number'],
                    }
                }

            },
        },
    },
    'additionalProperties': False,
    'required': ['combinatorial_line_metadata', 'common_line_metadata',
                 'name_elements'],
}
