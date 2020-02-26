from django.conf import settings

from main import redis

from . import exceptions


class ImportBroker:
    def __init__(self):
        self.storage = redis.ScratchStorage(
            key_prefix=f"{__name__}.{self.__class__.__name__}"
        )

    def _import_name(self, import_id):
        return f"{import_id}"

    def set_context(self, import_id, context):
        name = self._import_name(import_id)
        expires = getattr(settings, "EDD_IMPORT_CACHE_LENGTH", None)
        self.storage.save(context, name=name, expires=expires)

    def add_page(self, import_id, page):
        name = f"{self._import_name(import_id)}:pages"
        expires = getattr(settings, "EDD_IMPORT_CACHE_LENGTH", None)
        _, count = self.storage.append(page, name=name, expires=expires)
        return count

    def check_bounds(self, import_id, page, expected_count):
        size = getattr(settings, "EDD_IMPORT_PAGE_SIZE", 1000)
        limit = getattr(settings, "EDD_IMPORT_PAGE_LIMIT", 1000)
        if len(page) > size:
            # TODO uncovered
            raise exceptions.ImportTooLargeError(
                f"Page size is greater than maximum {size}"
            )
            # END uncovered
        if expected_count > limit:
            # TODO uncovered
            raise exceptions.ImportTooLargeError(
                f"Total number of pages is greater than allowed maximum {limit}"
            )
            # END uncovered
        name = f"{self._import_name(import_id)}:pages"
        count = self.storage.page_count(name)
        if count > expected_count:
            # TODO uncovered
            raise exceptions.ImportBoundsError(
                f"Found {count} instead of expected {expected_count} pages"
            )
            # END uncovered

    def clear_context(self, import_id):
        self.storage.delete(self._import_name(import_id))

    def clear_pages(self, import_id):
        """
        Clears all pages associated with this import ID
        """
        self.storage.delete(f"{self._import_name(import_id)}:pages")

    def load_context(self, import_id):
        """
        Loads context associated with this import ID
        :return: the context, or None if none has been set
        """
        return self.storage.load(self._import_name(import_id))

    def load_pages(self, import_id):
        """
        Fetches the pages of series data for the specified import
        :returns: a generator of the stored values (binary strings)
        """
        return self.storage.load_pages(f"{self._import_name(import_id)}:pages")
