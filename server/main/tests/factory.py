"""Factory classes used to generate objects under test."""

from unittest import mock

import environ
import factory
import faker
from django.contrib.auth import get_user_model
from django.contrib.auth import models as auth_models

from .. import models

fake = faker.Faker()


def test_file_path(name):
    cwd = environ.Path(__file__) - 1
    return cwd("files", name)


def load_test_file(name, mode="rb"):
    """Opens test files saved in the `files` directory."""
    filepath = test_file_path(name)
    return open(filepath, mode)


def create_fake_upload():
    fake_upload = mock.Mock()
    fake_upload.name = fake.file_name()
    fake_upload.size = fake.random_int()
    fake_upload.file = mock.Mock()
    fake_upload.file.content_type = fake.mime_type()
    return fake_upload


class StudyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Study

    name = factory.Faker("catch_phrase")
    description = factory.Faker("text", max_nb_chars=300)
    contact_extra = ""
    created = factory.SubFactory("main.tests.factory.UpdateFactory")
    updated = factory.SelfAttribute("created")


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
        django_get_or_create = ("name",)

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
        django_get_or_create = ("unit_name",)

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


class GroupFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = auth_models.Group
        django_get_or_create = ("name",)

    name = factory.Faker("word")


class UpdateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Update

    mod_time = factory.Faker("date_time")
    mod_by = factory.SubFactory(UserFactory)
    path = factory.Faker("uri_path")
    origin = factory.Faker("ipv4")


class SBMLTemplateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.SBMLTemplate

    created = factory.SubFactory("main.tests.factory.UpdateFactory")
    updated = factory.SelfAttribute("created")


class MetadataTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MetadataType

    type_name = factory.Faker("catch_phrase")
    for_context = factory.Iterator(
        (models.MetadataType.STUDY, models.MetadataType.LINE, models.MetadataType.ASSAY)
    )
