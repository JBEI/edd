from django.apps import AppConfig


class MetricConfig(AppConfig):
    label = "metric"
    name = "edd.metric"
    verbose_name = "Metric"

    def ready(self):
        # make sure to load/register all the signal handlers
        from . import signals  # noqa: F401
