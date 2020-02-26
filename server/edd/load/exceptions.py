class ImportError(Exception):
    pass


class ImportBoundsError(ImportError):
    pass


class ImportTaskError(ImportError):
    pass


class ImportTooLargeError(ImportError):
    pass
