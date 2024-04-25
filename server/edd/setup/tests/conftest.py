import io
import pathlib
from contextlib import contextmanager

import pytest
from django.test import override_settings
from django.urls import reverse

from edd.profile.factory import UserFactory
from main.models import StudyPermission
from main.tests import factory as main_factory

from ..broker import SetupRequest


def filesdir():
    return pathlib.Path(__file__).parent / "files"


class Session:
    def __init__(self, *, permission_type=StudyPermission.READ):
        self.user = UserFactory()
        self.study = main_factory.StudyFactory()
        self.study.userpermission_set.update_or_create(
            user=self.user,
            defaults={"permission_type": permission_type},
        )

    def create_upload_file(self, filename, content=None):
        file = io.BytesIO(content)
        file.name = filename
        return file

    @contextmanager
    def setup_empty(self):
        setup = SetupRequest(self.study.uuid)
        setup.store()
        yield setup
        setup.retire()

    @contextmanager
    # avoid writing "file" to disk and needing cleanup
    @override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
    def setup_with_resolved(self):
        setup = SetupRequest(self.study.uuid)
        with open(filesdir() / "simple.csv") as f:
            f.content_type = "text/csv"
            assert setup.upload({"file": f})
        setup.process_upload(self.user)
        yield setup
        setup.retire()

    @contextmanager
    # avoid writing "file" to disk and needing cleanup
    @override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
    def setup_with_strains(self):
        setup = SetupRequest(self.study.uuid)
        with open(filesdir() / "strain.csv") as f:
            f.content_type = "text/csv"
            assert setup.upload({"file": f})
        setup.process_upload(self.user)
        yield setup
        setup.retire()

    @contextmanager
    # avoid writing "file" to disk and needing cleanup
    @override_settings(EDD_LOAD_STORAGE="django.core.files.storage.InMemoryStorage")
    def setup_with_unresolved(self):
        setup = SetupRequest(self.study.uuid)
        with open(filesdir() / "unmatched.csv") as f:
            f.content_type = "text/csv"
            assert setup.upload({"file": f})
        setup.process_upload(self.user)
        yield setup
        setup.retire()

    def url(self, name, **kwargs):
        return reverse(name, kwargs={"slug": self.study.slug, **kwargs})


@pytest.fixture
def dir_of_test_files():
    return filesdir()


@pytest.fixture
def readable_session(db):
    return Session()


@pytest.fixture
def writable_session(db):
    return Session(permission_type=StudyPermission.WRITE)


@pytest.fixture
def edd_user(db):
    return UserFactory()
