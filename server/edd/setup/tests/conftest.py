import io
import pathlib
from contextlib import contextmanager

import pytest
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

    def path(self, filename):
        return filesdir() / filename

    @contextmanager
    def setup(self, *, upload_file=None, content_type="text/csv"):
        setup = SetupRequest(self.study.uuid)
        if upload_file:
            with open(upload_file) as f:
                f.content_type = content_type
                assert setup.upload({"file": f})
            setup.process_upload(self.user)
        else:
            setup.store()
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
