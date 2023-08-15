import logging
import re
from collections.abc import Callable, Iterable

logger = logging.getLogger(__name__)


class SearchRequest:
    """
    Simple API to use for functions registering with Select2.

    The function will receive an instance of SearchRequest, and should return
    results based on the properties and functions of that object.
    """

    DEFAULT_RESULT_COUNT = 20

    def __init__(self, request):
        self.request = request

    def optional_sort(self, queryset):
        "Apply the optional sorting parameter to the search queryset."
        sort_field = self.request.GET.get("sort", None)
        if not sort_field:
            return queryset
        return queryset.order_by(sort_field)

    @property
    def range(self):
        "Property containing the start, end indices for the search."
        page = int(self.request.GET.get("page", "1"))
        end = page * self.DEFAULT_RESULT_COUNT
        start = end - self.DEFAULT_RESULT_COUNT
        return start, end

    @property
    def term(self):
        "Property containing the search term to narrow the search."
        term = self.request.GET.get("term", "")
        return re.escape(term)

    @property
    def user(self):
        return self.request.user

    def __getitem__(self, key):
        return self.request.GET.get(key, None)


AutocompleteQuery = Callable[[SearchRequest], tuple[Iterable[dict], bool]]
search_registry: dict[str, AutocompleteQuery] = {}


class Select2:
    """
    Decorator for autocomplete searches for Select2 widgets.

    Any decorated function should take a SearchRequest parameter, and return an
    iterable of dict values and a boolean indicating if there are further items
    to return. Each dict should at minimum contain an "id" and "text" fields.

    The decorator takes a single argument, for the model key used to choose a
    search function.
    """

    def __init__(self, model_key: str):
        self.model_key = model_key

    def __call__(self, fn: AutocompleteQuery):
        search_registry[self.model_key] = fn
        return fn

    @classmethod
    def get_searcher(cls, key: str) -> AutocompleteQuery:
        try:
            return search_registry[key]
        except KeyError as e:
            raise ValueError(f"Unsupported model for autocomplete: '{key}'") from e


class Autocomplete:
    def __init__(self, model):
        self.model = model

    def search(self, request):
        try:
            search = Select2.get_searcher(self.model)
            items, more = search(SearchRequest(request))
            return {
                "pagination": {
                    "more": more,
                },
                "results": list(items),
            }
        except Exception as e:
            logger.exception(f"Invalid parameters to autocomplete search: {e}")
            raise e
