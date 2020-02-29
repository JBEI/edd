from django.apps import AppConfig


class SearchConfig(AppConfig):
    label = "search"
    name = "edd.search"
    verbose_name = "Search"

    def ready(self):
        # make sure to load/register all the signals
        from . import signals  # noqa: F401
