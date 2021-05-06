from django.apps import AppConfig


class DescribeConfig(AppConfig):
    label = "describe"
    name = "edd.describe"
    verbose_name = "Describe"

    def ready(self):
        # The F401 error code is "imported but unused" warning;
        # we ignore it here because we're purposefully importing unused modules
        # to make certain signal handlers are defined at the correct time

        # make sure to load/register all the signal handlers
        from . import signals  # noqa: F401
        from . import reporting  # noqa: F401
