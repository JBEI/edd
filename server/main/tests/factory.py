"""Factory classes used to generate objects under test."""

import environ
import factory
import faker
from django.core.files.base import ContentFile

from edd.profile.factory import UserFactory

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
    fake_upload = ContentFile(fake.binary(length=fake.random_int()))
    fake_upload.name = fake.file_name()
    fake_upload.content_type = fake.mime_type()
    return fake_upload


def create_fake_exportable_study(
    study,
    *,  # force everything else to kwargs-only
    assays_count=3,
    lines_count=10,
    time_value=12,
    types_count=3,
):
    """Populates a Study object with fake data for exports."""
    protocol = ProtocolFactory()
    mtypes = [MeasurementTypeFactory() for _i in range(types_count)]
    x_unit = UnitFactory()
    y_unit = UnitFactory()
    for _i in range(lines_count):
        line = LineFactory(study=study)
        for _j in range(assays_count):
            assay = AssayFactory(line=line, protocol=protocol)
            for t in mtypes:
                measurement = MeasurementFactory(
                    assay=assay, measurement_type=t, x_units=x_unit, y_units=y_unit,
                )
                ValueFactory(
                    measurement=measurement,
                    x=[time_value],  # keep everything same "time"
                    y=[fake.pyint()],
                )


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
        django_get_or_create = ("type_name",)

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


class StrainFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Strain

    registry_id = factory.Faker("uuid4")
    registry_url = factory.Faker("url")
