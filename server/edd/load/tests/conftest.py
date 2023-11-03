from pytest import fixture

from main.models import StudyPermission
from main.tests import factory as main_factory

from . import factory


@fixture
def readable_session(db):
    return factory.ImportSession()


@fixture
def writable_session(db):
    return factory.ImportSession(permission_type=StudyPermission.WRITE)


@fixture
def start_payload(db):
    return {
        "protocol": main_factory.ProtocolFactory().pk,
        "layout": "generic",
    }
