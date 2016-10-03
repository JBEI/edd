# coding: utf-8
from __future__ import division, unicode_literals


from builtins import str
from collections import namedtuple
from io import StringIO

from edd_utils.parsers import biolector, excel, hplc, skyline


ParsedInput = namedtuple('ParsedInput', ['file_type', 'parsed_data', ])


class ImportModeFlags(object):
    BIOLECTOR = 'biolector'
    HPLC = 'hplc'
    MASS_DISTRIBUTION = 'mdv'
    PROTEOMICS_OLD = 'pr'
    SKYLINE = 'skyline'
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
    # We pass the request directly along, so it can be read as a stream by the parser
    return ParsedInput(
        ImportFileTypeFlags.XML,
        biolector.getRawImportRecordsAsJSON(request, 0),
    )
parser_registry[(ImportModeFlags.BIOLECTOR, ImportFileTypeFlags.XML)] = biolector_parser


def excel_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.EXCEL,
        excel.import_xlsx_tables(file=request)
    )
parser_registry[(ImportModeFlags.STANDARD, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.PROTEOMICS_OLD, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.MASS_DISTRIBUTION, ImportFileTypeFlags.EXCEL)] = excel_parser


def skyline_parser(in_data):
    parser = skyline.SkylineParser()
    results = parser.export(in_data)
    return [
        {
            # TODO: try to parse item[0] based on worklist format
            'assay_name': item[0],
            # TODO: extract timestamp value from item[0]
            'data': [[0, item[2]]],
            'kind': 'skyline',
            'line_name': item[0],
            'measurement_name': item[1],
            'metadata_by_name': {},
        }
        for item in results['rows']
    ]


def skyline_csv_parser(request):
    # we could get Mac-style \r line endings, need to use StringIO to handle
    return ParsedInput(
        ImportFileTypeFlags.CSV,
        skyline_parser([row.split(',') for row in StringIO(str(request.read()), newline=None)])
    )
parser_registry[(ImportModeFlags.SKYLINE, ImportFileTypeFlags.CSV)] = skyline_csv_parser


def skyline_excel_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.EXCEL,
        skyline_parser(excel.import_xlsx_tables(file=request))
    )
parser_registry[(ImportModeFlags.SKYLINE, ImportFileTypeFlags.EXCEL)] = skyline_excel_parser


def hplc_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.PLAINTEXT,
        hplc.getRawImportRecordsAsJSON(request)
    )
parser_registry[(ImportModeFlags.HPLC, ImportFileTypeFlags.PLAINTEXT)] = hplc_parser
