import itertools

from pytest import fixture
from threadlocals import threadlocals

from edd.profile.factory import UserFactory
from edd.search.registry import AdminHmacRegistry
from main.tests import factory


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


@fixture(autouse=True, scope="session")
def ice_admin():
    """
    Sets up a connection with the Administrator user in the test ICE server.
    Connection initializes once at the beginning of the test session.
    """
    registry = AdminHmacRegistry()
    with registry.login():
        yield registry


# NOTE: this *must* keep django_db_setup parameter, else the fixture will run
#   on the existing development database, and not the isolated test database!
@fixture(autouse=True, scope="session")
def ice_users(django_db_setup, django_db_blocker, ice_admin):
    """
    Creates or ensures that some user accounts exist in the test ICE server,
    one with an Admin level account, one that will get read permissions on some
    created strains, and one that will get no permissions. See `ice_strains`
    fixture for the strains created in ICE for the test session. The fixture
    returns a dict containing three EDD User objects, each with an API key to
    the test ICE server.
    """
    # users on the EDD side
    with django_db_blocker.unblock():
        admin = UserFactory(email="admin@example.org")
        readonly = UserFactory(email="reader@example.org")
        noperm = UserFactory(email="none@example.org")
    # check or create users on ICE side
    if (admin_id := ice_admin.get_user_id(admin)) is None:
        admin_id = ice_admin.create_admin(admin)
    admin._ice_id = admin_id
    if (read_id := ice_admin.get_user_id(readonly)) is None:
        read_id = ice_admin.create_user(readonly)
    readonly._ice_id = read_id
    if (none_id := ice_admin.get_user_id(noperm)) is None:
        none_id = ice_admin.create_user(noperm)
    noperm._ice_id = none_id
    # assign API keys to the users
    with django_db_blocker.unblock():
        for user in [admin, readonly, noperm]:
            ice_admin.create_api_key(user)
    # return users for use in tests
    yield {"admin": admin, "readonly": readonly, "noperm": noperm}
    # cleanup created users
    with django_db_blocker.unblock():
        admin.delete()
        readonly.delete()
        noperm.delete()


@fixture(autouse=True, scope="session")
def ice_strains(ice_admin, ice_users):
    """
    Creates some demonstration strains in the test ICE server, some of which
    will have read permissions in ICE for the `readonly` user created from the
    `ice_users` fixture. Returns a list of dict, each dict containing values
    returned from ICE for the created strains.
    """
    with factory.load_test_file("ice_entries.csv") as entries_file:
        ice_admin.bulk_upload(entries_file)
    # fetch the part IDs
    it = ice_admin.get_entries(sort="created", asc="false", limit=10)
    entries = list(itertools.islice(it, 10))
    # set read permissions on some of the created strains
    user_id = ice_users["readonly"]._ice_id
    for entry in entries[:5]:
        ice_admin.set_permission(entry["id"], user_id)
    # return the part IDs for use in tests
    return entries
