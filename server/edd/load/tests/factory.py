import io
from contextlib import contextmanager

import environ
import factory
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from edd.profile.factory import UserFactory
from main.models import MetadataType, StudyPermission
from main.tests import factory as main_factory

from .. import models
from ..broker import LoadRequest
from ..layout import Record


def build_test_file_path(*args):
    """
    Gets the absolute path of the test file specified by args.

    :param args: one or more directories relative to the
        edd/load/tests/files directory
    :return: the absolute path
    """
    cwd = environ.Path(__file__) - 1
    return cwd("files", *args)


def load_test_file(*args, mode="rb"):
    """Opens test files saved in the `files` directory."""
    filepath = build_test_file_path(*args)
    return open(filepath, mode)


class DefaultUnitFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.DefaultUnit

    measurement_type = factory.SubFactory(main_factory.MeasurementTypeFactory)
    unit = factory.SubFactory(main_factory.UnitFactory)


class MeasurementNameTransformFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.MeasurementNameTransform

    input_type_name = ""
    edd_type_name = factory.SubFactory(main_factory.MeasurementTypeFactory)


class ImportSession:
    """
    Defines the basic records required to test import views. Provides a
    generated user, with configurable permission level to a generated study.
    """

    def __init__(self, permission_type=StudyPermission.READ):
        self.user = UserFactory()
        self.study = main_factory.StudyFactory()
        self.study.userpermission_set.update_or_create(
            user=self.user,
            defaults={"permission_type": permission_type},
        )

    def create_ready_records(self, count):
        # create some ready-to-go records
        mtype = main_factory.MeasurementTypeFactory()
        xunit = main_factory.UnitFactory()
        yunit = main_factory.UnitFactory()
        for _ in range(count):
            line = main_factory.LineFactory(study=self.study)
            assay = main_factory.AssayFactory(line=line, protocol=self.protocol)
            yield Record(
                assay_id=assay.id,
                line_id=assay.line_id,
                shape="0",
                type_id=mtype.id,
                x_unit_id=xunit.id,
                x=[main_factory.fake.pyfloat(min_value=0.0, max_value=24.0)],
                y_unit_id=yunit.id,
                y=[main_factory.fake.pyfloat(min_value=0.0, max_value=100.0)],
            )

    def create_resolved_records(self):
        line = main_factory.LineFactory(study=self.study)
        mtype = main_factory.MetaboliteFactory()
        return [
            Record(
                locator=line.name,
                line_id=line.id,
                shape="0",
                type_name=mtype.type_name,
                type_id=mtype.id,
                x=[main_factory.fake.pyfloat(min_value=0.0, max_value=24.0)],
                x_unit="n/a",
                y=[main_factory.fake.pyfloat(min_value=0.0, max_value=100.0)],
                y_unit="n/a",
            ),
        ]

    def create_unresolved_records(self, locator_name="A1"):
        records = [
            Record(
                locator=locator_name,
                shape="0",
                type_name="unknown type",
                x=[],
                x_unit="unknown unit x",
                y=[main_factory.fake.pyfloat(min_value=0.0, max_value=100.0)],
                y_unit="unknown unit y",
            ),
        ]
        return locator_name, records

    def create_upload_file(self, filename):
        file = io.BytesIO()
        file.name = filename
        return file

    def simple_skyline_upload(self, lr):
        line = main_factory.LineFactory(study=self.study)
        assay = main_factory.AssayFactory(line=line, protocol=lr.protocol)
        time = MetadataType.system("Time")
        assay.metadata_add(time, "24")
        assay.save()
        main_factory.ProteinFactory(accession_code="P12345")
        content = f"Replicate Name,Protein Name,Total Area\n{assay.name},sp|P12345,42"
        file = SimpleUploadedFile(
            "example",
            content.encode("utf-8"),
            content_type="text/csv",
        )
        lr.upload({"file": file})

    @contextmanager
    def start(self, *, layout_key="generic"):
        # create a dummy request with random protocol
        self.protocol = main_factory.ProtocolFactory()
        lr = LoadRequest(
            layout_key=layout_key,
            study_uuid=self.study.uuid,
            protocol_uuid=self.protocol.uuid,
        )
        lr.store()
        yield lr
        lr.retire()

    def url(self, name, **kwargs):
        return reverse(name, kwargs={"slug": self.study.slug, **kwargs})
