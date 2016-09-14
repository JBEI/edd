# coding: utf-8
from __future__ import division, unicode_literals


from collections import namedtuple


ParsedInput = namedtuple('ParsedInput', ['file_type', 'parsed_data', ])


class ImportModeFlags(object):
    BIOLECTOR = 'biolector'
    HPLC = 'hplc'
    PROTEOMICS_OLD = 'pr'
    STANDARD = 'std'
    TRANSCRIPTOMICS = 'tr'


class ImportFileTypeFlags(object):
    CSV = 'csv'
    EXCEL = 'xlsx'
    PLAINTEXT = 'txt'
    XML = 'xml'


parser_registry = {}


def find_parser(import_mode, file_type):
    return parser_registry.get((import_mode, file_type), None)


def biolector_parser(request):
    from edd_utils.parsers import biolector
    # We pass the request directly along, so it can be read as a stream by the parser
    return ParsedInput(
        ImportFileTypeFlags.XML,
        biolector.getRawImportRecordsAsJSON(request, 0),
    )
parser_registry[(ImportModeFlags.BIOLECTOR, ImportFileTypeFlags.XML)] = biolector_parser


def excel_parser(request):
    from edd_utils.parsers import excel
    return ParsedInput(
        ImportFileTypeFlags.EXCEL,
        excel.import_xlsx_tables(file=request)
    )
parser_registry[(ImportModeFlags.STANDARD, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.PROTEOMICS_OLD, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.EXCEL)] = excel_parser


def hplc_parser(request):
    from edd_utils.parsers import hplc
    return ParsedInput(
        ImportFileTypeFlags.PLAINTEXT,
        hplc.getRawImportRecordsAsJSON(request)
    )
parser_registry[(ImportModeFlags.HPLC, ImportFileTypeFlags.PLAINTEXT)] = hplc_parser
