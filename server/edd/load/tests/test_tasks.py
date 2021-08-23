from tempfile import NamedTemporaryFile
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from .. import exceptions, tasks
from ..broker import ImportBroker, LoadRequest
from .factory import CategoryFactory, LayoutFactory, ParserFactory


class ImportTableTaskTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.protocol = factory.ProtocolFactory()
        cls.measurement_type = factory.MeasurementTypeFactory()

    def test_success(self):
        # setup the context before the task
        import_id = uuid4()
        broker = ImportBroker()
        broker.set_context(import_id, {})
        broker.add_page(
            import_id,
            [
                {
                    "assay_id": "named_or_new",
                    "assay_name": "bar",
                    "compartment": "0",
                    "data": [[12, 34]],
                    "kind": "std",
                    "line_id": "new",
                    "line_name": "foo",
                    "measurement_id": self.measurement_type.pk,
                    "measurement_name": self.measurement_type.type_name,
                    "protocol_id": self.protocol.pk,
                    "units_id": "1",
                },
            ],
        )
        # directly execute task
        tasks.import_table_task(self.study.pk, self.user.pk, import_id)
        # asserts
        assert (
            models.MeasurementValue.objects.filter(study_id=self.study.pk).count() == 1
        )

    def test_bad_study(self):
        with pytest.raises(exceptions.ImportTaskError):
            # triggering failure in task with bad study key
            tasks.import_table_task(None, self.user.pk, uuid4())

    def test_failed(self):
        with pytest.raises(exceptions.ImportTaskError):
            # triggering failure in task by failing to save import data
            tasks.import_table_task(self.study.pk, self.user.pk, None)


class EmailTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()

    def test_send_import_completion_email(self):
        added = 13
        updated = 42
        tasks.send_import_completion_email(
            study_id=self.study.pk,
            user_id=self.user.pk,
            added=added,
            updated=updated,
            duration="a New York minute",
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to
        assert str(added) in sent_email.body
        assert str(updated) in sent_email.body

    def test_send_import_failure_email(self):
        tasks.send_import_failure_email(
            study_id=self.study.pk,
            user_id=self.user.pk,
            duration="a New York minute",
            message="Whoopsie",
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to

    def test_send_import_failure_email_admins(self):
        tasks.send_import_failure_email_admins(
            study_id=self.study.pk,
            user_id=self.user.pk,
            import_id=None,
            duration="a New York minute",
            message="Whoopsie",
            trace="a fake traceback",
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email not in sent_email.to
        assert self.user.email not in sent_email.cc
        assert self.user.email not in sent_email.bcc

    def test_send_wizard_failed_email(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, options=LoadRequest.options.email_when_complete,
        )
        load.store()
        tasks.send_wizard_failed_email(load.request, self.user.pk)
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to

    def test_send_wizard_failed_email_no_option(self):
        load = LoadRequest()
        load.store()
        tasks.send_wizard_failed_email(load.request, self.user.pk)
        assert len(mail.outbox) == 0

    def test_send_wizard_paused_email(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, options=LoadRequest.options.email_when_complete,
        )
        load.store()
        tasks.send_wizard_paused_email(load.request, self.user.pk)
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to

    def test_send_wizard_paused_email_no_option(self):
        load = LoadRequest()
        load.store()
        tasks.send_wizard_paused_email(load.request, self.user.pk)
        assert len(mail.outbox) == 0

    def test_send_wizard_success_email(self):
        added = 13
        updated = 42
        load = LoadRequest(
            study_uuid=self.study.uuid, options=LoadRequest.options.email_when_complete,
        )
        load.store()
        tasks.send_wizard_success_email(load.request, self.user.pk, added, updated)
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to
        assert str(added) in sent_email.body
        assert str(updated) in sent_email.body

    def test_send_wizard_success_email_no_option(self):
        added = 13
        updated = 42
        load = LoadRequest()
        load.store()
        tasks.send_wizard_success_email(load.request, self.user.pk, added, updated)
        assert len(mail.outbox) == 0


class WizardParseTaskTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.protocol = factory.ProtocolFactory()
        cls.category = CategoryFactory()
        cls.layout = LayoutFactory()

    def setUp(self):
        self.load = LoadRequest(
            protocol_uuid=self.protocol.uuid, study_uuid=self.study.uuid,
        )
        # storing the LoadRequest in backend will allow transitions
        self.load.store()

    def tearDown(self):
        self.load.retire()

    def test_parse_with_missing_upload(self):
        with pytest.raises(exceptions.UnsupportedMimeTypeError):
            tasks.wizard_parse_and_resolve(
                self.load.request, self.user.pk, self.layout.pk, self.category.pk
            )

    def test_parse_without_parser_match(self):
        file = SimpleUploadedFile("example.csv", b"", content_type="text/csv")
        self.load.update({"file": file})
        with pytest.raises(exceptions.UnsupportedMimeTypeError):
            tasks.wizard_parse_and_resolve(
                self.load.request, self.user.pk, self.layout.pk, self.category.pk
            )

    def test_parse_with_bad_parser(self):
        parser = ParserFactory(
            layout=self.layout, parser_class="bad.missing.ParserClass"
        )
        file = SimpleUploadedFile("example", b"", content_type=parser.mime_type)
        self.load.update({"file": file})
        with pytest.raises(exceptions.BadParserError):
            tasks.wizard_parse_and_resolve(
                self.load.request, self.user.pk, self.layout.pk, self.category.pk
            )

    def test_parse_success(self):
        uuid = self._setup_parse_success()
        # include Time metadata so resolve step can complete
        self._setup_parse_add_time()
        with patch("edd.load.tasks.wizard_execute_loading") as task:
            # value of target currently doesn't matter as long as not None
            tasks.wizard_parse_and_resolve(
                uuid, self.user.pk, self.layout.pk, self.category.pk, target=True
            )
        updated = LoadRequest.fetch(uuid)
        assert updated.status == LoadRequest.Status.READY
        task.delay.assert_called_once()

    def test_parse_without_target(self):
        uuid = self._setup_parse_success()
        # include Time metadata so resolve step can complete
        self._setup_parse_add_time()
        with patch("edd.load.tasks.wizard_execute_loading") as task:
            tasks.wizard_parse_and_resolve(
                uuid, self.user.pk, self.layout.pk, self.category.pk
            )
        updated = LoadRequest.fetch(uuid)
        assert updated.status == LoadRequest.Status.READY
        task.delay.assert_not_called()

    def test_parse_non_ready_state(self):
        uuid = self._setup_parse_success()
        # omitting Time metadata so resolve step finishes with RESOLVED instead of READY
        tasks.wizard_parse_and_resolve(
            uuid, self.user.pk, self.layout.pk, self.category.pk
        )
        updated = LoadRequest.fetch(uuid)
        assert updated.status == LoadRequest.Status.RESOLVED

    def test_parse_success_excel(self):
        uuid = self._setup_parse_excel()
        # include Time metadata so resolve step can complete
        self._setup_parse_add_time()
        with patch("edd.load.tasks.wizard_execute_loading") as task:
            # value of target currently doesn't matter as long as not None
            tasks.wizard_parse_and_resolve(
                uuid, self.user.pk, self.layout.pk, self.category.pk, target=True
            )
        updated = LoadRequest.fetch(uuid)
        assert updated.status == LoadRequest.Status.READY
        task.delay.assert_called_once()

    def _setup_parse_add_time(self):
        time = models.MetadataType.system("Time")
        qs = models.Assay.objects.filter(study=self.study, protocol=self.protocol)
        qs.update(metadata={time.pk: 12})

    def _setup_parse_success(self):
        mime = "text/csv"
        assay = factory.AssayFactory(study=self.study, protocol=self.protocol)
        factory.ProteinFactory(accession_code="P12345")
        ParserFactory(
            layout=self.layout,
            mime_type=mime,
            parser_class="edd.load.parsers.skyline.SkylineCsvParser",
        )
        content = f"""
        Replicate Name,Protein Name,Total Area
        {assay.name},sp|P12345,42
        """
        file = SimpleUploadedFile("example", content.encode("utf-8"), content_type=mime)
        self.load.update({"file": file})
        return self.load.request

    def _setup_parse_excel(self):
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assay = factory.AssayFactory(study=self.study, protocol=self.protocol)
        factory.ProteinFactory(accession_code="P12345")
        ParserFactory(
            layout=self.layout,
            mime_type=mime,
            parser_class="edd.load.parsers.skyline.SkylineExcelParser",
        )
        wb = Workbook()
        wb.active.title = "Simple Upload"
        wb.active.append(["Replicate Name", "Protein Name", "Total Area"])
        wb.active.append([assay.name, "sp|P12345", 42])
        with NamedTemporaryFile() as temp:
            wb.save(temp)
            temp.seek(0)
            file = SimpleUploadedFile("example", temp.read(), content_type=mime)
            self.load.update({"file": file})
        return self.load.request


class WizardLoadTaskTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.protocol = factory.ProtocolFactory()
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.arcA = factory.LineFactory(study=cls.study, name="arcA")
        cls.mtype = factory.MeasurementTypeFactory()
        cls.x_unit = factory.UnitFactory()
        cls.y_unit = factory.UnitFactory()

    def setUp(self):
        self.load = LoadRequest(
            protocol_uuid=self.protocol.uuid,
            status=LoadRequest.Status.READY,
            study_uuid=self.study.uuid,
            x_units_name=self.x_unit.unit_name,
            y_units_name=self.y_unit.unit_name,
        )
        # storing the LoadRequest in backend will allow transitions
        self.load.store()

    def tearDown(self):
        self.load.retire()

    def test_load_success(self):
        self._prepare_loading()
        tasks.wizard_execute_loading(self.load.request, self.user.pk)
        # asserts
        qs = models.MeasurementValue.objects.filter(study_id=self.study.pk)
        assert qs.count() == 1
        updated = LoadRequest.fetch(self.load.request)
        assert updated.status == LoadRequest.Status.COMPLETED

    def test_load_bad_context(self):
        broker = ImportBroker()
        broker.set_context(self.load.request, {})
        tasks.wizard_execute_loading(self.load.request, self.user.pk)
        # asserts
        qs = models.MeasurementValue.objects.filter(study_id=self.study.pk)
        assert qs.count() == 0
        updated = LoadRequest.fetch(self.load.request)
        assert updated.status == LoadRequest.Status.FAILED

    def _prepare_loading(self):
        broker = ImportBroker()
        # minimal data to load into study
        broker.set_context(
            self.load.request,
            {
                "loa_pks": {self.arcA.pk},
                "matched_assays": False,
                "use_assay_times": False,
            },
        )
        broker.add_page(
            self.load.request,
            [
                {
                    "compartment": models.Measurement.Compartment.UNKNOWN,
                    "data": [[[12], [42]]],
                    "format": models.Measurement.Format.SCALAR,
                    "line_id": self.arcA.pk,
                    "measurement_id": self.mtype.pk,
                    "x_unit_id": self.x_unit.pk,
                    "y_unit_id": self.y_unit.pk,
                }
            ],
        )
