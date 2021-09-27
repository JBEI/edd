import factory
from django.contrib.sites.models import Site

from main.tests.factory import StudyFactory  # noqa F401

from .. import models


class SiteFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Site

    name = factory.Faker("catch_phrase")
    domain = factory.Faker("catch_phrase")


class ExampleSetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.DescribeExampleSet

    site = factory.SubFactory(SiteFactory)
    name = factory.Faker("catch_phrase")
    example_file = factory.django.FileField()
    example_image_file = factory.django.ImageField()
