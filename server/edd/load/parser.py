import codecs
import csv
from collections import namedtuple

from edd.utilities import guess_extension

from .parsers.table import biolector, excel, hplc, skyline

ParsedInput = namedtuple("ParsedInput", ["file_type", "parsed_data"])


class ImportModeFlags:
    BIOLECTOR = "biolector"
    HPLC = "hplc"
    MASS_DISTRIBUTION = "mdv"
    SKYLINE = "skyline"
    STANDARD = "std"
    TRANSCRIPTOMICS = "tr"


class ImportFileTypeFlags:
    CSV = "csv"
    EXCEL = "xlsx"
    PLAINTEXT = "txt"
    XML = "xml"


parser_registry = {}


def find_parser(import_mode, file_type):
    extension = guess_extension(file_type)
    return parser_registry.get((import_mode, extension), None)


class ParserFunction:
    def __init__(self, mode, ext):
        self.signature = (mode, ext)

    def __call__(self, fn, *args, **kwargs):
        parser_registry[self.signature] = fn
        return fn


@ParserFunction(ImportModeFlags.BIOLECTOR, ImportFileTypeFlags.XML)
def biolector_parser(request):
    # We pass the request directly along, so it can be read as a stream by the parser
    return ParsedInput(
        ImportFileTypeFlags.XML, biolector.getRawImportRecordsAsJSON(request, 0)
    )


@ParserFunction(ImportModeFlags.STANDARD, ImportFileTypeFlags.CSV)
@ParserFunction(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.CSV)
@ParserFunction(ImportModeFlags.MASS_DISTRIBUTION, ImportFileTypeFlags.CSV)
def csv_parser(request):
    reader = codecs.getreader(request.charset or "utf8")
    return ParsedInput(ImportFileTypeFlags.CSV, reader(request).read())


@ParserFunction(ImportModeFlags.STANDARD, ImportFileTypeFlags.EXCEL)
@ParserFunction(ImportModeFlags.TRANSCRIPTOMICS, ImportFileTypeFlags.EXCEL)
@ParserFunction(ImportModeFlags.MASS_DISTRIBUTION, ImportFileTypeFlags.EXCEL)
def excel_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.EXCEL, excel.import_xlsx_tables(file=request)
    )


@ParserFunction(ImportModeFlags.SKYLINE, ImportFileTypeFlags.CSV)
def skyline_csv_parser(request):
    # we could get Mac-style \r line endings, need to use StringIO to handle
    parser = skyline.SkylineParser()
    # row will be bytes, need to decode (to probably utf8)
    reader = csv.reader(row.decode(request.charset or "utf8") for row in request)
    spreadsheet = (row for row in reader)
    return ParsedInput(
        ImportFileTypeFlags.CSV, parser.getRawImportRecordsAsJSON(spreadsheet)
    )


@ParserFunction(ImportModeFlags.SKYLINE, ImportFileTypeFlags.EXCEL)
def skyline_excel_parser(request):
    parser = skyline.SkylineParser()
    excel_dict = excel.import_xlsx_table(file=request)
    spreadsheet = [excel_dict["headers"]] + excel_dict["values"]
    return ParsedInput(
        ImportFileTypeFlags.EXCEL, parser.getRawImportRecordsAsJSON(spreadsheet)
    )


@ParserFunction(ImportModeFlags.HPLC, ImportFileTypeFlags.PLAINTEXT)
def hplc_parser(request):
    return ParsedInput(
        ImportFileTypeFlags.PLAINTEXT, hplc.getRawImportRecordsAsJSON(request)
    )
