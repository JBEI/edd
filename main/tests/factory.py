# coding: utf-8
"""
Factory classes used to generate objects under test.
"""

import environ
import factory

from django.contrib.auth import get_user_model

from .. import models


def test_file_path(name):
    cwd = environ.Path(__file__) - 1
    return cwd("files", name)


def load_test_file(name, mode="rb"):
    "Opens test files saved in the `files` directory."
    filepath = test_file_path(name)
    return open(filepath, mode)


class StudyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Study

    name = factory.Faker("catch_phrase")
    description = factory.Faker("text", max_nb_chars=300)
    contact_extra = ""


class LineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Line

    name = factory.Faker("domain_word")
    description = factory.Faker("text", max_nb_chars=300)
    contact = factory.SubFactory("main.tests.factory.UserFactory")
    experimenter = factory.SubFactory("main.tests.factory.UserFactory")
    study = factory.SubFactory(StudyFactory)


class ProtocolFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Protocol

    name = factory.Faker("bs")
    categorization = factory.Iterator(
        [code for code, _ in models.Protocol.CATEGORY_CHOICE]
    )
    owned_by = factory.SubFactory("main.tests.factory.UserFactory")


class AssayFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Assay

    name = factory.Faker("domain_word")
    study = factory.SelfAttribute("line.study")
    line = factory.SubFactory(LineFactory)
    protocol = factory.SubFactory(ProtocolFactory)
    experimenter = factory.SubFactory("main.tests.factory.UserFactory")


class MeasurementTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MeasurementType

    type_name = factory.Faker("domain_word")


class MetaboliteFactory(MeasurementTypeFactory):
    class Meta:
        model = models.Metabolite

    charge = factory.Faker("pyint")
    carbon_count = factory.Faker("pyint")
    # Limit the magnitude to prevent errors casting big numbers to db size
    molar_mass = factory.Faker("pyfloat", left_digits=5, right_digits=5)
    molecular_formula = factory.Faker("ean")


class ProteinFactory(MeasurementTypeFactory):
    class Meta:
        model = models.ProteinIdentifier


class GeneFactory(MeasurementTypeFactory):
    class Meta:
        model = models.GeneIdentifier


class UnitFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MeasurementUnit
        django_get_or_create = ('unit_name', )

    unit_name = factory.Faker("word")


class MeasurementFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Measurement

    experimenter = factory.SubFactory("main.tests.factory.UserFactory")
    measurement_type = factory.SubFactory(MeasurementTypeFactory)
    study = factory.SelfAttribute("assay.study")
    assay = factory.SubFactory(AssayFactory)
    compartment = models.Measurement.Compartment.UNKNOWN
    x_units = factory.SubFactory(UnitFactory)
    y_units = factory.SubFactory(UnitFactory)


class ValueFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MeasurementValue

    study = factory.SelfAttribute("measurement.study")
    measurement = factory.SubFactory(MeasurementFactory)
    x = []
    y = []


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
        django_get_or_create = ("username",)

    username = factory.Faker("user_name")
    email = factory.Faker("safe_email")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
