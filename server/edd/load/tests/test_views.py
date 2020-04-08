import json
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from faker import Faker
from rest_framework import status
from rest_framework.reverse import reverse as rest_reverse
from rest_framework.test import APITestCase

from edd import TestCase
from edd.rest.tests import EddApiTestCaseMixin
from main import models
from main.tests import factory as main_factory

from .. import exceptions, parser
from ..broker import ImportBroker, LoadRequest
from . import factory

faker = Faker()


class CategoryViewTests(EddApiTestCaseMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = main_factory.UserFactory()
        # relying on defaults from migrations for data to query

    def test_list_category_with_anonymous(self):
        url = rest_reverse("rest:load_categories-list")
        response = self.client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_category_with_login(self):
        url = rest_reverse("rest:load_categories-list")
        self.client.force_login(self.user)
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK


class LoadRequestViewTests(EddApiTestCaseMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = main_factory.UserFactory()
        cls.study = main_factory.StudyFactory()
        cls.study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.protocol = main_factory.ProtocolFactory()

    def test_create_load_anonymous(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_load_no_permission(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_load_missing_parameters(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        self.client.force_login(self.user)
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_load_without_upload(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        task.delay.assert_not_called()

    def test_create_load_with_upload(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        task.delay.assert_called_once()

    def test_create_load_simulated_known_error(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.store") as store:
            store.side_effect = exceptions.EDDImportError
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_create_load_simulated_unknown_error(self):
        url = rest_reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.store") as store:
            store.side_effect = AttributeError
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_destroy_load_anonymous(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_destroy_load_no_permission(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_destroy_load_missing(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(self.user)
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_destroy_load(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_200_OK

    def test_destroy_load_simulated_known_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.retire") as retire:
            retire.side_effect = exceptions.EDDImportError
            response = self.client.delete(url)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_destroy_load_simulated_unknown_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.retire") as retire:
            retire.side_effect = AttributeError
            response = self.client.delete(url)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_update_load_anonymous(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_load_no_permission(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_load_does_not_exist(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(self.user)
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_missing_parameters(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_wrong_study(self):
        wrong = main_factory.StudyFactory()
        load = LoadRequest(study_uuid=wrong.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_missing(self):
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_load_during_processing(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, status=LoadRequest.Status.PROCESSING
        )
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_already_complete(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, status=LoadRequest.Status.COMPLETED
        )
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_without_upload(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_not_called()

    def test_update_load_with_upload(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_called_once()

    def test_update_load_simulated_known_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.update") as update:
            update.side_effect = exceptions.EDDImportError
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_update_load_simulated_unknown_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = rest_reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.update") as update:
            update.side_effect = AttributeError
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def _build_common_payload(self):
        category = factory.CategoryFactory()
        layout = factory.LayoutFactory()
        return {
            "category": category.pk,
            "layout": layout.pk,
            "protocol": self.protocol.pk,
        }


class ImportTableViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = main_factory.UserFactory()
        cls.study = main_factory.StudyFactory()
        cls.url = reverse("main:load:table", kwargs={"slug": cls.study.slug})

    def setUp(self):
        self.uuid = str(uuid4())

    def tearDown(self):
        # clean up any stuff added to ImportBroker
        broker = ImportBroker()
        broker.clear_context(self.uuid)
        broker.clear_pages(self.uuid)

    def test_get_anonymous(self):
        response = self.client.get(self.url)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={self.url}")

    def test_get_without_read(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_with_read(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.READ
        )
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        assert response.status_code == status.HTTP_200_OK
        self.assertTemplateUsed(response, "edd/load/load.html")

    def test_delete_anonymous(self):
        response = self.client.delete(self.url)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={self.url}")

    def test_delete_without_read(self):
        self.client.force_login(self.user)
        response = self.client.delete(self.url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_without_write(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.READ
        )
        self.client.force_login(self.user)
        response = self.client.delete(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_bad_id(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        response = self.client.delete(self.url, b"not-a-uuid")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_simulated_error(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        with patch("edd.load.views.ImportBroker.clear_pages") as api:
            api.side_effect = AttributeError
            response = self.client.delete(self.url, self.uuid.encode("utf-8"))
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_delete_ok(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        response = self.client.delete(self.url, self.uuid.encode("utf-8"))
        assert response.status_code == status.HTTP_200_OK

    def test_post_anonymous(self):
        response = self.client.post(self.url, content_type="application/json")
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={self.url}")

    def test_post_without_read(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, content_type="application/json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_post_without_write(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.READ
        )
        self.client.force_login(self.user)
        response = self.client.post(self.url, content_type="application/json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_post_empty_payload(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        response = self.client.post(self.url, content_type="application/json")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_post_only_page(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        payload = json.dumps(
            {
                "importId": self.uuid,
                "page": 1,
                "series": [{"dummy": "object"}, {"another": "thing"}],
                "totalPages": 1,
            }
        )
        with patch("edd.load.tasks.import_table_task") as task:
            # fake the task returning a task ID
            task.delay.return_value.id = uuid4()
            response = self.client.post(
                self.url, payload.encode("utf-8"), content_type="application/json"
            )
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_called_once()

    def test_post_first_page(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        payload = json.dumps(
            {
                "importId": self.uuid,
                "page": 1,
                "series": [{"dummy": "object"}, {"another": "thing"}],
                "totalPages": 2,
            }
        )
        with patch("edd.load.tasks.import_table_task") as task:
            response = self.client.post(
                self.url, payload.encode("utf-8"), content_type="application/json"
            )
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_not_called()

    def test_post_middle_page(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        payload = json.dumps(
            {
                "importId": self.uuid,
                "page": 13,
                "series": [{"dummy": "object"}, {"another": "thing"}],
                "totalPages": 42,
            }
        )
        with patch("edd.load.tasks.import_table_task") as task:
            response = self.client.post(
                self.url, payload.encode("utf-8"), content_type="application/json"
            )
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_not_called()

    @override_settings(EDD_IMPORT_PAGE_LIMIT=1)
    def test_post_out_of_bounds(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        payload = json.dumps(
            {
                "importId": self.uuid,
                "page": 1,
                "series": [{"dummy": "object"}, {"another": "thing"}],
                "totalPages": 2,
            }
        )
        with patch("edd.load.tasks.import_table_task") as task:
            response = self.client.post(
                self.url, payload.encode("utf-8"), content_type="application/json"
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        task.delay.assert_not_called()

    def test_post_simulated_error(self):
        self.study.userpermission_set.create(
            user=self.user, permission_type=models.StudyPermission.WRITE
        )
        self.client.force_login(self.user)
        payload = json.dumps(
            {
                "importId": self.uuid,
                "page": 1,
                "series": [{"dummy": "object"}, {"another": "thing"}],
                "totalPages": 2,
            }
        )
        with patch("edd.load.views.ImportBroker") as broker:
            broker.side_effect = exceptions.LoadError
            response = self.client.post(
                self.url, payload.encode("utf-8"), content_type="application/json"
            )
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


class UtilityParseViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.url = reverse("main:load_flat:parse")
        cls.user = main_factory.UserFactory()
        cls.import_mode = "fakemode"

    def setUp(self):
        self._filename = faker.file_name()
        # using a known-extension mime that won't overlap with anything real
        self._mime = "audio/basic"
        self._ext = parser.guess_extension(self._mime)
        self.file = SimpleUploadedFile(
            self._filename, b"fake content", content_type=self._mime
        )

    def tearDown(self):
        key = (self.import_mode, self._ext)
        if key in parser.parser_registry:
            del parser.parser_registry[key]

    def test_parse_anonymous(self):
        response = self.client.post(
            self.url, {"file": self.file, "import_mode": self.import_mode}
        )
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={self.url}")

    def test_parse_known(self):
        def fake_parser(request):
            return parser.ParsedInput("fake", "more fake")

        self._set_parse_function(fake_parser)
        self.client.force_login(self.user)
        response = self.client.post(
            self.url, {"file": self.file, "import_mode": self.import_mode}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_parse_unknown(self):
        self.client.force_login(self.user)
        response = self.client.post(
            self.url, {"file": self.file, "import_mode": self.import_mode}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_parse_simulated_error(self):
        def fake_parser(request):
            raise AttributeError()

        self._set_parse_function(fake_parser)
        self.client.force_login(self.user)
        response = self.client.post(
            self.url, {"file": self.file, "import_mode": self.import_mode}
        )
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def _set_parse_function(self, function):
        parser.parser_registry[(self.import_mode, self._ext)] = function


class ImportViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.study = main_factory.StudyFactory()
        cls.url = reverse("main:load:wizard", kwargs={"slug": cls.study.slug})

    def test_get_with_anonymous(self):
        response = self.client.get(self.url)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={self.url}")

    def test_get_with_no_permission(self):
        self.client.force_login(main_factory.UserFactory())
        response = self.client.get(self.url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_with_readonly(self):
        user = main_factory.UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=user
        )
        self.client.force_login(user)
        response = self.client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_with_write(self):
        user = main_factory.UserFactory()
        self.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=user
        )
        self.client.force_login(user)
        response = self.client.get(self.url)
        assert response.status_code == status.HTTP_200_OK
        self.assertTemplateUsed(response, "edd/load/wizard.html")


class ImportHelpViewTests(TestCase):
    def test_help_with_anonymous(self):
        url = reverse("main:load_flat:wizard_help")
        response = self.client.get(url)
        login_url = reverse("account_login")
        self.assertRedirects(response, f"{login_url}?next={url}")

    def test_help(self):
        url = reverse("main:load_flat:wizard_help")
        self.client.force_login(main_factory.UserFactory())
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        self.assertTemplateUsed(response, "edd/load/wizard_help.html")
