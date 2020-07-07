"""Integration tests for ICE."""

from io import BytesIO

from django.test import tag
from django.urls import reverse
from faker import Faker
from openpyxl.workbook import Workbook
from requests import codes

from edd import TestCase
from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi, IceApiException
from main import models
from main.tests import factory

faker = Faker()


def user_to_ice_json(user):
    # these fields are all required for ICE
    return {
        "firstName": user.first_name,
        "lastName": user.last_name,
        "initials": user.initials,
        "description": "",
        "institution": "",
        "email": user.email,
        "password": "",
    }


def ice_url(path):
    if path[0] == "/":
        path = path[1:]
    return f"http://ice:8080/rest/{path}"


class IceUserCheck:
    user_url = ice_url("/users")

    def __init__(self, ice):
        self.ice = ice

    def create(self, user):
        """Create a user and return its ID."""
        try:
            response = self.ice.session.post(
                self.user_url,
                json=user_to_ice_json(user),
                params={"sendEmail": "false"},
            )
            created = response.json()
            return created["id"]
        except ValueError as e:
            raise AssertionError(f"Bad response: {response.content}") from e
        except Exception as e:
            raise AssertionError(f"Failed to create user {user}") from e

    def exists(self, user):
        """Return a user ID if exists, otherwise return None."""
        try:
            response = self.ice.session.get(
                self.user_url, params={"filter": user.email}
            )
            info = response.json()
            if info["resultCount"] != 0:
                return info["users"][0]["id"]
            return None
        except ValueError as e:
            raise AssertionError(f"Bad response: {response.content}") from e
        except Exception as e:
            raise AssertionError(f"Failed to check user {user}") from e


@tag("integration")
class IceIntegrationTests(TestCase):
    """Sets of tests to validate communication between EDD and ICE."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        auth = HmacAuth("edd", "Administrator")
        ice = IceApi(auth)
        try:
            # make sure ICE has users matching EDD users
            cls._ensureTestUsers(ice)
            # populate ICE with some strains
            cls._populateTestStrains(ice)
            # add strains to a folder
            cls._populateTestFolder(ice)
        except Exception as e:
            cls.tearDownClass()
            raise e

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.admin_ice_user = factory.UserFactory(email="admin@example.org")
        cls.read_ice_user = factory.UserFactory(email="reader@example.org")
        cls.none_ice_user = factory.UserFactory(email="none@example.org")

    @classmethod
    def _ensureTestUsers(cls, ice):
        check = IceUserCheck(ice)
        for user in [cls.admin_ice_user, cls.read_ice_user, cls.none_ice_user]:
            user_id = check.exists(user)
            if user_id is None:
                user_id = check.create(user)
            user._ice_id = user_id
        # set the admin account type on admin_ice_user
        acct = user_to_ice_json(cls.admin_ice_user)
        acct.update(accountType="ADMIN")
        ice.session.put(ice_url(f"/users/{cls.admin_ice_user._ice_id}"), json=acct)

    @classmethod
    def _populateTestStrains(cls, ice):
        # create a BulkUpload object
        response = ice.session.put(ice_url("/uploads"), json={"type": "strain"})
        upload_id = response.json()["id"]
        # add file data to the BulkUpload
        with factory.load_test_file("ice_entries.csv") as entries:
            response = ice.session.post(
                ice_url(f"/uploads/{upload_id}/file"),
                files={"type": "strain", "file": entries},
            )
        # set upload to approved to create (click "submit" button)
        response = ice.session.put(
            ice_url(f"/uploads/{upload_id}/status"),
            json={"id": upload_id, "status": "APPROVED"},
        )
        # fetch the part IDs
        response = ice.session.get(
            ice_url("/collections/available/entries"),
            params={"sort": "created", "asc": "false"},
        )
        entries = response.json()["data"][:10]
        cls.part_ids = [p["partId"] for p in reversed(entries)]
        cls.db_ids = [p["id"] for p in reversed(entries)]
        # set read permissions on some of the created strains
        for idx in range(5):
            response = ice.session.post(
                ice_url(f"/parts/{cls.part_ids[idx]}/permissions"),
                json={
                    "article": "ACCOUNT",
                    "articleId": cls.read_ice_user._ice_id,
                    "type": "READ_ENTRY",
                    "typeId": cls.db_ids[idx],
                },
            )

    @classmethod
    def _populateTestFolder(cls, ice):
        # create folder
        cls.folder_name = faker.catch_phrase()
        response = ice.session.post(
            ice_url("/folders"), json={"folderName": cls.folder_name}
        )
        cls.folder_id = response.json()["id"]
        # set it to public
        # ice.session.put(ice_url(f"/folders/{cls.folder_id}/permissions/public"))
        # add our parts to it
        ice.session.put(
            ice_url("/folders/entries"),
            json={
                "all": False,
                "destination": [{"id": cls.folder_id}],
                "entries": cls.db_ids,
            },
        )

    def test_admin_find_parts(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        # verify that admin user finds all parts
        entries_url = ice_url("/collections/available/entries?sort=created&asc=false")
        response = ice.session.get(entries_url)
        payload = response.json()["data"]
        entries = {p["partId"] for p in payload}
        self.assertTrue(entries.issuperset(self.part_ids))

    def test_admin_read_part(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        # verify that admin user can load specific entry
        entry = ice.get_entry(self.part_ids[0])
        self.assertIsNotNone(entry)
        entry = ice.get_entry(self.part_ids[5])
        self.assertIsNotNone(entry)

    def test_reader_find_parts(self):
        reader_auth = HmacAuth("edd", self.read_ice_user.email)
        ice = IceApi(reader_auth)
        # verify that reader user finds the five parts with permissions set
        entries_url = ice_url("/collections/available/entries?sort=created&asc=false")
        response = ice.session.get(entries_url)
        payload = response.json()["data"]
        entries = {p["partId"] for p in payload}
        self.assertTrue(entries.issuperset(self.part_ids[:5]))
        self.assertEqual(len(entries.intersection(self.part_ids[5:])), 0)

    def test_reader_read_part(self):
        reader_auth = HmacAuth("edd", self.read_ice_user.email)
        ice = IceApi(reader_auth)
        # verify that reader user can load specific entry with permission
        entry = ice.get_entry(self.part_ids[0])
        self.assertIsNotNone(entry)
        # verify that reader user cannot load entry without permission
        with self.assertRaises(IceApiException):
            ice.get_entry(self.part_ids[5])

    def test_none_find_parts(self):
        none_auth = HmacAuth("edd", self.none_ice_user.email)
        ice = IceApi(none_auth)
        # verify that user with no permissions finds no parts
        entries_url = ice_url("/collections/available/entries?sort=created&asc=false")
        response = ice.session.get(entries_url)
        payload = response.json()["data"]
        entries = {p["partId"] for p in payload}
        self.assertEqual(len(entries.intersection(self.part_ids)), 0)

    def test_none_read_part(self):
        none_auth = HmacAuth("edd", self.none_ice_user.email)
        ice = IceApi(none_auth)
        # verify no permission user cannot load entries
        with self.assertRaises(IceApiException):
            ice.get_entry(self.part_ids[0])
        with self.assertRaises(IceApiException):
            ice.get_entry(self.part_ids[5])

    def test_upload_links_admin(self):
        admin_study = factory.StudyFactory()
        admin_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=self.admin_ice_user
        )
        response = self._run_upload(self.part_ids, admin_study, self.admin_ice_user)
        # should return OK from upload
        self.assertEqual(response.status_code, codes.ok)
        # there should be 10 strains on the study
        self.assertEqual(
            models.Strain.objects.filter(line__study=admin_study).distinct().count(), 10
        )
        # TODO: cannot check links because tests in transaction that ultimately calls rollback()
        # Celery task is only ever submitted when the transaction calls commit() successfully

    def test_upload_links_reader(self):
        reader_study = factory.StudyFactory()
        reader_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=self.read_ice_user
        )
        # should return 500 error on uploading admin-only strains
        # skip testing this until ICE-90 is resolved
        # response = self._run_upload(self.part_ids, reader_study, self.read_ice_user)
        # self.assertEqual(response.status_code, codes.server_error)
        # should return OK on uploading readable strains
        response = self._run_upload(self.part_ids[:5], reader_study, self.read_ice_user)
        self.assertEqual(response.status_code, codes.ok)
        # there should be 5 strains on the study
        self.assertEqual(
            models.Strain.objects.filter(line__study=reader_study).distinct().count(), 5
        )
        # TODO: cannot check links because tests in transaction that ultimately calls rollback()
        # Celery task is only ever submitted when the transaction calls commit() successfully

    def test_upload_links_none(self):
        none_study = factory.StudyFactory()
        none_study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.WRITE, user=self.none_ice_user
        )
        # should return 400 error on uploading admin-only strains
        response = self._run_upload(self.part_ids, none_study, self.none_ice_user)
        self.assertEqual(response.status_code, codes.bad_request)
        # should return 400 error on uploading reader-only strains
        response = self._run_upload(self.part_ids[:5], none_study, self.none_ice_user)
        self.assertEqual(response.status_code, codes.bad_request)
        # there should be 0 strains on the study
        self.assertEqual(
            models.Strain.objects.filter(line__study=none_study).distinct().count(), 0
        )

    def test_get_folder_known_id_admin_user(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        folder = ice.get_folder(self.folder_id)
        self.assertIsNotNone(folder)
        self.assertEqual(folder.id, self.folder_id)
        self.assertEqual(folder.name, self.folder_name)

    def test_get_folder_known_id_reader_user(self):
        reader_auth = HmacAuth("edd", self.read_ice_user.email)
        ice = IceApi(reader_auth)
        with self.assertRaises(IceApiException):
            ice.get_folder(self.folder_id)

    def test_get_folder_known_id_none_user(self):
        none_auth = HmacAuth("edd", self.none_ice_user.email)
        ice = IceApi(none_auth)
        with self.assertRaises(IceApiException):
            ice.get_folder(self.folder_id)

    def test_get_folder_known_bad_id(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        folder = ice.get_folder(self.folder_id + 1)
        self.assertIsNone(folder)

    def test_get_folder_entries(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        # set result_limit to a small number to exercise the generator on entries
        ice.result_limit = 2
        folder = ice.get_folder_entries(self.folder_id)
        self.assertIsNotNone(folder)
        self.assertEqual(folder.id, self.folder_id)
        self.assertEqual(folder.name, self.folder_name)
        self.assertEqual(len(list(folder.entries)), 10)

    def test_folder_from_url(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        folder = ice.folder_from_url(f"{ice.base_url}/folders/{self.folder_id}/")
        self.assertIsNotNone(folder)
        self.assertEqual(folder.id, self.folder_id)
        self.assertEqual(folder.name, self.folder_name)

    def test_search(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        # pRS426 is one of the items in the ice_entries.csv file
        results = ice.search("pRS426")
        # multiple matching entries, check that one is found
        # ceiling on number of results depends on how often test suite runs
        self.assertNotEqual(len(results), 0)

    def test_write_protection(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        with self.assertRaises(IceApiException):
            ice.add_experiment_link(self.db_ids[0], "Error", "https://www.example.net/")

    def test_add_remove_experiment_link(self):
        admin_auth = HmacAuth("edd", self.admin_ice_user.email)
        ice = IceApi(admin_auth)
        ice.write_enabled = True
        study = factory.StudyFactory()
        study_url = f"https://edd.example.org/s/{study.slug}/"
        for entry_id in self.db_ids:
            ice.add_experiment_link(entry_id, study.name, study_url)
        # verify link exists on a given entry
        found_links = list(ice.fetch_experiment_links(self.db_ids[3]))
        self.assertEqual(len(found_links), 1)
        # verify that removal works
        ice.unlink_entry_from_study(self.db_ids[3], study_url)
        found_links = list(ice.fetch_experiment_links(self.db_ids[3]))
        self.assertEqual(len(found_links), 0)

    def _create_workbook(self, parts):
        upload = BytesIO()
        wb = Workbook()
        ws = wb.active
        for i, title in enumerate(["Line Name", "Part ID", "Media"], 1):
            ws.cell(row=1, column=i).value = title
        for i, part in enumerate(parts, 2):
            ws.cell(row=i, column=1).value = part
            ws.cell(row=i, column=2).value = part
            ws.cell(row=i, column=3).value = "M9"
        wb.save(upload)
        upload.name = "description.xlsx"
        upload.content_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        upload.seek(0)
        return upload

    def _run_upload(self, parts, study, user):
        upload = self._create_workbook(parts)
        self.client.force_login(user)
        response = self.client.post(
            reverse("main:describe:describe", kwargs={"slug": study.slug}),
            data={"file": upload},
        )
        return response
