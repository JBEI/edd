from django.apps import AppConfig


class LoadConfig(AppConfig):
    label = "load"
    name = "edd.load"
    verbose_name = "Data Loading"

    def ready(self):
        # The F401 error code is "imported but unused" warning;
        # we ignore it here because we're purposefully importing unused modules
        # to make certain signal handlers are defined at the correct time

        # make sure to load/register all the signal handlers
        from . import signals  # noqa: F401
        from . import reporting  # noqa: F401
