import factory

from main.tests import factory as edd_factory

from . import models


class CampaignFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Campaign

    name = factory.Faker("catch_phrase")
    description = factory.Faker("text")


class CampaignMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.CampaignMembership

    campaign = factory.SubFactory(CampaignFactory)
    study = factory.SubFactory(edd_factory.StudyFactory)
    status = models.CampaignMembership.Status.ACTIVE


class CampaignLinkRegistry:
    """Add a registered link operation to CampaignPermission in a context manager."""

    def __init__(self, link_type, operation):
        self.link_type = link_type
        self.operation = operation

    def __enter__(self):
        models.CampaignPermission.register_link(self.link_type, self.operation)
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        models.CampaignPermission.unregister_link(self.link_type, self.operation)
