from io import BytesIO
from unittest.mock import patch

from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from edd.rest.tests import EddApiTestCaseMixin
from main import models
from main.tests import factory as main_factory

from .. import exceptions
from ..broker import LoadRequest
from . import factory


class CategoryViewTests(EddApiTestCaseMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = main_factory.UserFactory()
        # relying on defaults from migrations for data to query

    def test_list_category_with_anonymous(self):
        url = reverse("rest:load_categories-list")
        response = self.client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_category_with_login(self):
        url = reverse("rest:load_categories-list")
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
        url = reverse("rest:study_load-list", args=[self.study.pk])
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_load_no_permission(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_load_missing_parameters(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        self.client.force_login(self.user)
        response = self.client.post(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_load_without_upload(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        task.delay.assert_not_called()

    def test_create_load_with_upload(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        task.delay.assert_called_once()

    def test_create_load_simulated_known_error(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.store") as store:
            store.side_effect = exceptions.EDDImportError
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_create_load_simulated_unknown_error(self):
        url = reverse("rest:study_load-list", args=[self.study.pk])
        payload = self._build_common_payload()
        payload.update(file=BytesIO(b"some file content"))
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.store") as store:
            store.side_effect = AttributeError
            response = self.client.post(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_destroy_load_anonymous(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_destroy_load_no_permission(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_destroy_load_missing(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(self.user)
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_destroy_load(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_200_OK

    def test_destroy_load_simulated_known_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.retire") as retire:
            retire.side_effect = exceptions.EDDImportError
            response = self.client.delete(url)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_destroy_load_simulated_unknown_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.retire") as retire:
            retire.side_effect = AttributeError
            response = self.client.delete(url)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_update_load_anonymous(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_load_no_permission(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(main_factory.UserFactory())
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_load_does_not_exist(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        self.client.force_login(self.user)
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_missing_parameters(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        self.client.force_login(self.user)
        response = self.client.patch(url, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_wrong_study(self):
        wrong = main_factory.StudyFactory()
        load = LoadRequest(study_uuid=wrong.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_missing(self):
        url = reverse("rest:study_load-detail", args=[self.study.pk, "abcdef"])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_load_during_processing(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, status=LoadRequest.Status.PROCESSING
        )
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_already_complete(self):
        load = LoadRequest(
            study_uuid=self.study.uuid, status=LoadRequest.Status.COMPLETED
        )
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_load_without_upload(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.tasks.wizard_parse_and_resolve") as task:
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_202_ACCEPTED
        task.delay.assert_not_called()

    def test_update_load_with_upload(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
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
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
        payload = self._build_common_payload()
        self.client.force_login(self.user)
        with patch("edd.load.rest.views.LoadRequest.update") as update:
            update.side_effect = exceptions.EDDImportError
            response = self.client.patch(url, payload, format="multipart")
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_update_load_simulated_unknown_error(self):
        load = LoadRequest(study_uuid=self.study.uuid)
        load.store()
        url = reverse("rest:study_load-detail", args=[self.study.pk, load.request])
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
