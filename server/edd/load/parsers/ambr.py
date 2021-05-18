from .core import MultiSheetExcelParserMixin
from .generic import GenericImportParser


class AmbrExcelParser(MultiSheetExcelParserMixin, GenericImportParser):
    pass
