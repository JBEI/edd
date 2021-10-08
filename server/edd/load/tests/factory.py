import json

import environ
import factory

from main.tests.factory import MeasurementTypeFactory, UnitFactory

from .. import models


def build_test_file_path(*args):
    """
    Gets the absolute path of the test file specified by args.

    :param args: one or more directories relative to the
        edd_file_importer/tests/files directory
    :return: the absolute path
    """
    cwd = environ.Path(__file__) - 1
    return cwd("files", *args)


def load_test_file(*args, mode="rb"):
    """Opens test files saved in the `files` directory."""
    filepath = build_test_file_path(*args)
    return open(filepath, mode)


def load_test_json(*args, mode="rb"):
    filepath = build_test_file_path(*args)
    with open(filepath, mode) as fp:
        return json.loads(fp.read())


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Category

    name = factory.Faker("catch_phrase")
    # adding 99 to avoid clashes with future built-in Category objects
    sort_key = factory.Sequence(lambda n: n + 99)


class LayoutFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Layout

    name = factory.Faker("catch_phrase")


class ParserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.ParserMapping

    layout = factory.SubFactory(LayoutFactory)
    mime_type = factory.Faker("mime_type")

class DefaultUnitFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.DefaultUnit

    measurement_type = factory.SubFactory(MeasurementTypeFactory)
    unit = factory.SubFactory(UnitFactory)


class MeasurementNameTransformFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MeasurementNameTransform

    input_type_name = ""
    edd_type_name = ""
