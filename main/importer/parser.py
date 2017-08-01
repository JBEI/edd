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


def csv_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.CSV,
        request.read()
    )
parser_registry[(ImportModeFlags.STANDARD, ImportFileTypeFlags.CSV)] = csv_parser
parser_registry[(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.CSV)] = csv_parser
parser_registry[(ImportModeFlags.MASS_DISTRIBUTION, ImportFileTypeFlags.CSV)] = csv_parser


def excel_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.EXCEL,
        excel.import_xlsx_tables(file=request)
    )
parser_registry[(ImportModeFlags.STANDARD, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.EXCEL)] = excel_parser
parser_registry[(ImportModeFlags.MASS_DISTRIBUTION, ImportFileTypeFlags.EXCEL)] = excel_parser


def skyline_csv_parser(request):
    # we could get Mac-style \r line endings, need to use StringIO to handle
    parser = skyline.SkylineParser()
    spreadsheet = [row.split(',') for row in StringIO(str(request.read()), newline=None)]
    return ParsedInput(
        ImportFileTypeFlags.CSV,
        parser.getRawImportRecordsAsJSON(spreadsheet)
    )
parser_registry[(ImportModeFlags.SKYLINE, ImportFileTypeFlags.CSV)] = skyline_csv_parser


def skyline_excel_parser(request):
    parser = skyline.SkylineParser()
    spreadsheet = excel.import_xlsx_tables(file=request)
    return ParsedInput(
        ImportFileTypeFlags.EXCEL,
        parser.getRawImportRecordsAsJSON(spreadsheet)
    )
parser_registry[(ImportModeFlags.SKYLINE, ImportFileTypeFlags.EXCEL)] = skyline_excel_parser


def hplc_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.PLAINTEXT,
        hplc.getRawImportRecordsAsJSON(request)
    )
parser_registry[(ImportModeFlags.HPLC, ImportFileTypeFlags.PLAINTEXT)] = hplc_parser
