import logging

from .utilities import ErrorAggregator

logger = logging.getLogger(__name__)

# skeleton for Import 2.0, to be fleshed out later.  For now, we're just aggregating errors &
# warnings as part of the early testing process.
class ImportUploadHandler(ErrorAggregator):
    pass
