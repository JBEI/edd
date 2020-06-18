from django.apps import AppConfig


class CampaignConfig(AppConfig):
    label = "campaign"
    name = "edd.campaign"
    verbose_name = "Campaign"

    def ready(self):
        # make sure to load/register all the signals
        from . import signals  # noqa
