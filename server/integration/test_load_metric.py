from pytest import fixture

from edd.load import tasks
from edd.load.tests import factory as load_factory
from edd.metric.models import StudyLog
from main.models import StudyPermission


@fixture
def writable_session(db):
    return load_factory.ImportSession(permission_type=StudyPermission.WRITE)


def test_wizard_import_adds_entry(writable_session):
    with writable_session.start() as lr:
        records = list(writable_session.create_ready_records(10))
        assert lr.ok_to_process()
        lr.process(records, writable_session.user)
        tasks.submit_save(lr, writable_session.user, background=False)

    logs = StudyLog.objects.filter(
        event=StudyLog.Event.IMPORTED,
        study=writable_session.study,
    )
    assert logs.count() == 1
