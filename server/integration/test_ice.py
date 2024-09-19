"""Integration tests for ICE."""

import pytest
from django.test import override_settings

from edd.profile.factory import UserFactory
from edd.search.registry import AdminHmacRegistry, RegistryError


@pytest.mark.ice_integration
@override_settings(ICE_URL=None)
def test_no_configured_ICE_raises_error():
    with pytest.raises(RegistryError):
        registry = AdminHmacRegistry()
        # raise error on trying to access URL when not set up
        registry.base_url


@pytest.mark.ice_integration
@override_settings(ICE_URL="https://example.com")
def test_configured_ICE_without_trailing_slash():
    registry = AdminHmacRegistry()
    assert registry.base_url == "https://example.com"


@pytest.mark.ice_integration
@override_settings(ICE_URL="https://example.com/")
def test_configured_ICE_strips_trailing_slash():
    registry = AdminHmacRegistry()
    assert registry.base_url == "https://example.com"


@pytest.mark.ice_integration
def test_action_without_login_throws_error(ice_users):
    # new object hasn't called .login()
    registry = AdminHmacRegistry()
    with pytest.raises(RegistryError):
        registry.get_user_id(ice_users["readonly"])


@pytest.mark.ice_integration
def test_action_after_logout_throws_error(ice_users):
    registry = AdminHmacRegistry()
    with registry.login():
        # force logout
        registry.logout()
        with pytest.raises(RegistryError):
            registry.get_user_id(ice_users["readonly"])


@pytest.mark.ice_integration
def test_admin_get_unknown_user(db, ice_admin, ice_users):
    user = UserFactory()
    assert ice_admin.get_user_id(user) is None


@pytest.mark.ice_integration
def test_admin_create_user_twice_is_error(db, ice_admin, ice_users):
    with pytest.raises(RegistryError):
        ice_admin.create_user(ice_users["readonly"])
