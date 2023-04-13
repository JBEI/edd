from pytest import fixture
from threadlocals import threadlocals


@fixture(autouse=True)
def clear_threadlocal_request():
    """
    Resets the request threadlocal variable before and after a test. EDD uses
    a threadlocal variable to make the current request available everywhere,
    primarily so the Update model can ensure only one entry is created per
    request. When running tests that can trigger inserting a new Update to the
    database, not clearing this causes transaction errors.
    """
    threadlocals.set_thread_variable("request", None)
    yield
    threadlocals.set_thread_variable("request", None)
