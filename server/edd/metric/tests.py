import io
import json

from django.http import QueryDict
from django.urls import reverse
from rest_framework.reverse import reverse as api_reverse
from rest_framework.test import APITestCase

from edd import TestCase
from edd.export.broker import ExportBroker
from edd.export.tasks import export_table_task, export_worklist_task
from edd.load.broker import ImportBroker, LoadRequest
from edd.load.tasks import import_table_task, wizard_execute_loading
from edd.rest.tests import EddApiTestCaseMixin
from main import models as edd_models
from main.tests import factory

from .models import StudyLog


class StudyLogMixin:
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = factory.UserFactory()

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def _find_log(self, *args, **kwargs):
        return StudyLog.objects.filter(*args, user=self.user, **kwargs)

    def _writable_study(self):
        study = factory.StudyFactory()
        study.userpermission_set.update_or_create(
            permission_type=edd_models.StudyPermission.WRITE, user=self.user,
        )
        return study


def _permission_command(level, *, user=None, group=None, public=False):
    """Build a JSON command string to send to our hacky permission view."""
    command = {"type": level}
    if user is not None:
        command.update(user={"id": user.id})
    elif group is not None:
        command.update(group={"id": group.id})
    elif public:
        command.update(public=None)
    else:
        raise ValueError("Must pick one of user, group, or public")
    return json.dumps([command])


class StudyLogReceiverTests(StudyLogMixin, TestCase):
    def test_create_study_adds_entry(self):
        url = reverse("main:create_study")
        name = factory.fake.catch_phrase()
        form = {"name": name}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.CREATED)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.study.name == name
        assert sl.detail == {}

    def test_add_line_adds_entry(self):
        study = self._writable_study()
        url = reverse("main:lines", kwargs={"slug": study.slug})
        form = {"action": "line", "line-name": factory.fake.catch_phrase()}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 1}

    def test_enable_line_adds_entry(self):
        study = self._writable_study()
        line = factory.LineFactory(active=False, study=study)
        url = reverse("main:lines", kwargs={"slug": study.slug})
        form = {"action": "enable", "lineId": [line.id]}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 1}

    def test_disable_line_adds_entry(self):
        study = self._writable_study()
        line = factory.LineFactory(study=study)
        url = reverse("main:lines", kwargs={"slug": study.slug})
        form = {"action": "disable_confirm", "lineId": [line.id]}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": -1}

    def test_clone_line_adds_entry(self):
        study = self._writable_study()
        line = factory.LineFactory(study=study)
        url = reverse("main:lines", kwargs={"slug": study.slug})
        form = {"action": "clone", "lineId": [line.id]}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 1}

    def test_clone_multiple_line_adds_entry(self):
        study = self._writable_study()
        to_clone = 4
        lines = [factory.LineFactory(study=study) for _ in range(to_clone)]
        url = reverse("main:lines", kwargs={"slug": study.slug})
        form = {"action": "clone", "lineId": [line.id for line in lines]}

        self.client.post(url, data=form, follow=True)

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": to_clone}

    def test_upload_experiment_description_csv_adds_entry(self):
        study = self._writable_study()
        # minimal description of two lines
        file = io.BytesIO(b"Line Name,\nfoo,\nbar,")
        file.name = "description.csv"
        file.content_type = "text/csv"

        self.client.post(
            reverse("main:describe:describe", kwargs={"slug": study.slug}),
            {"file": file},
        )

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 2}

    def test_upload_experiment_description_xlsx_adds_entry(self):
        study = self._writable_study()
        filename = "ExperimentDescription_simple.xlsx"
        with factory.load_test_file(filename) as fp:
            file = io.BytesIO(fp.read())
        file.name = filename
        file.content_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        self.client.post(
            reverse("main:describe:describe", kwargs={"slug": study.slug}),
            {"file": file},
        )

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 2}

    def test_combinatorial_ui_adds_entry(self):
        study = self._writable_study()

        self.client.post(
            reverse("main:describe:describe", kwargs={"slug": study.slug}),
            br"""
            {
                "name_elements":{
                    "elements":["replicate_num"]
                },
                "custom_name_elts":{},
                "replicate_count":3,
                "combinatorial_line_metadata":{},
                "common_line_metadata":{}
            }
            """.strip(),
            content_type="application/json",
        )

        qs = self._find_log(event=StudyLog.Event.DESCRIBED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 3}

    def test_ui_export_task_adds_entry(self):
        study = self._writable_study()
        to_export = 5
        factory.create_fake_exportable_study(study, lines_count=to_export)
        params = QueryDict(mutable=True)
        params.update(studyId=study.id)
        storage = ExportBroker(self.user.id)
        path = storage.save_params(params)

        export_table_task.s(self.user.id, path).apply()

        qs = self._find_log(event=StudyLog.Event.EXPORTED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": to_export}

    def test_ui_export_multiple_studies_adds_entry(self):
        study_a = self._writable_study()
        study_b = self._writable_study()
        factory.create_fake_exportable_study(study_a, lines_count=3)
        factory.create_fake_exportable_study(study_b, lines_count=5)
        params = QueryDict(mutable=True)
        params.update(studyId=study_a.id)
        params.update(studyId=study_b.id)
        storage = ExportBroker(self.user.id)
        path = storage.save_params(params)

        export_table_task.s(self.user.id, path).apply()

        # with multiple study exports, no individual study is singled out in log
        qs = self._find_log(event=StudyLog.Event.EXPORTED, study__isnull=True)
        assert qs.count() == 1
        sl = qs.get()
        # count is 3 + 5 from both studies
        assert sl.detail == {"count": 8}

    def test_legacy_import_adds_entry(self):
        study = self._writable_study()
        protocol = factory.ProtocolFactory()
        measurement_type = factory.MeasurementTypeFactory()
        import_id = factory.fake.uuid4()
        storage = ImportBroker()
        storage.set_context(import_id, {})
        storage.add_page(
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
                    "measurement_id": measurement_type.pk,
                    "measurement_name": measurement_type.type_name,
                    "protocol_id": protocol.pk,
                    "units_id": "1",
                },
            ],
        )

        import_table_task.s(study.id, self.user.id, import_id).apply()

        qs = self._find_log(event=StudyLog.Event.IMPORTED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 1, "protocol": str(protocol.uuid)}

    def test_wizard_import_adds_entry(self):
        study = self._writable_study()
        line = factory.LineFactory(study=study)
        protocol = factory.ProtocolFactory()
        measurement_type = factory.MeasurementTypeFactory()
        x_unit = factory.UnitFactory()
        y_unit = factory.UnitFactory()
        broker = ImportBroker()
        load = LoadRequest(
            protocol_uuid=protocol.uuid,
            status=LoadRequest.Status.READY,
            study_uuid=study.uuid,
            x_units_name=x_unit.unit_name,
            y_units_name=y_unit.unit_name,
        )
        # storing the LoadRequest in backend will allow transitions
        load.store()
        # minimal data to load into study
        broker.set_context(
            load.request,
            {"loa_pks": {line.pk}, "matched_assays": False, "use_assay_times": False},
        )
        broker.add_page(
            load.request,
            [
                {
                    "compartment": edd_models.Measurement.Compartment.UNKNOWN,
                    "data": [[[12], [42]]],
                    "format": edd_models.Measurement.Format.SCALAR,
                    "line_id": line.pk,
                    "measurement_id": measurement_type.pk,
                    "x_unit_id": x_unit.pk,
                    "y_unit_id": y_unit.pk,
                }
            ],
        )

        wizard_execute_loading.s(load.request, self.user.id).apply()

        qs = self._find_log(event=StudyLog.Event.IMPORTED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": 1, "protocol": str(protocol.uuid)}

    def test_adding_permission_adds_log(self):
        study = self._writable_study()
        other = factory.UserFactory()
        command = _permission_command(edd_models.StudyPermission.READ, user=other)

        self.client.post(
            reverse("main:permissions", kwargs={"slug": study.slug}),
            data={"data": command},
        )

        qs = self._find_log(event=StudyLog.Event.PERMISSION)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {
            "added": f"u:{other.id}",
            "permission": edd_models.StudyPermission.READ,
            "slug": study.slug,
        }

    def test_removing_permission_adds_log(self):
        study = self._writable_study()
        other = factory.UserFactory()
        study.userpermission_set.create(
            permission_type=edd_models.StudyPermission.READ, user=other,
        )
        command = _permission_command(edd_models.StudyPermission.NONE, user=other)

        self.client.post(
            reverse("main:permissions", kwargs={"slug": study.slug}),
            data={"data": command},
        )

        qs = self._find_log(event=StudyLog.Event.PERMISSION)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {
            "removed": f"u:{other.id}",
            "permission": edd_models.StudyPermission.READ,
            "slug": study.slug,
        }

    def test_clearing_permission_adds_log(self):
        study = self._writable_study()

        self.client.delete(reverse("main:permissions", kwargs={"slug": study.slug}))

        qs = self._find_log(event=StudyLog.Event.PERMISSION)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {
            "removed": f"u:{self.user.id}",
            "permission": edd_models.StudyPermission.WRITE,
            "slug": study.slug,
        }

    def test_viewing_study_adds_log(self):
        study = self._writable_study()

        self.client.get(reverse("main:overview", kwargs={"slug": study.slug}))

        qs = self._find_log(event=StudyLog.Event.VIEWED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {}

    def test_viewing_study_twice_adds_single_log(self):
        study = self._writable_study()

        self.client.get(reverse("main:overview", kwargs={"slug": study.slug}))
        self.client.get(reverse("main:lines", kwargs={"slug": study.slug}))

        qs = self._find_log(event=StudyLog.Event.VIEWED, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {}

    def test_worklist_adds_log(self):
        study = self._writable_study()
        to_export = 5
        factory.create_fake_exportable_study(study, lines_count=to_export)
        params = QueryDict(mutable=True)
        params.update(studyId=study.id)
        storage = ExportBroker(self.user.id)
        path = storage.save_params(params)

        export_worklist_task.s(self.user.id, path).apply()

        qs = self._find_log(event=StudyLog.Event.WORKLIST, study=study)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.detail == {"count": to_export}


class StudyLogReceiverAPITests(StudyLogMixin, EddApiTestCaseMixin, APITestCase):
    def test_api_create_study_adds_entry(self):
        url = api_reverse("rest:studies-list")
        name = factory.fake.catch_phrase()
        payload = {
            "name": name,
            "description": "description goes here",
            "contact_id": self.user.id,
        }

        with self.settings(EDD_ONLY_SUPERUSER_CREATE=False):
            self.client.post(url, payload)

        qs = self._find_log(event=StudyLog.Event.CREATED)
        assert qs.count() == 1
        sl = qs.get()
        assert sl.study.name == name
        assert sl.detail == {}

    def test_api_export_adds_entry(self):
        study = self._writable_study()
        to_export = 5
        factory.create_fake_exportable_study(study, lines_count=to_export)

        response = self.client.get(
            api_reverse("rest:export-list"), {"in_study": study.slug}
        )

        qs = self._find_log(event=StudyLog.Event.EXPORTED)
        assert qs.count() == 1, response.content
        sl = qs.get()
        assert sl.detail == {"count": to_export}

    def test_api_stream_export_adds_entry(self):
        study = self._writable_study()
        to_export = 5
        factory.create_fake_exportable_study(study, lines_count=to_export)

        response = self.client.get(
            api_reverse("rest:stream-export-list"), {"in_study": study.slug}
        )

        qs = self._find_log(event=StudyLog.Event.EXPORTED)
        assert qs.count() == 1, response.streaming_content
        sl = qs.get()
        assert sl.detail == {"count": to_export}
