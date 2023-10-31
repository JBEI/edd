from http import HTTPStatus

from django.contrib.admin.sites import all_sites
from django.urls import reverse
from pytest import fixture, mark

from . import factory

readonly_names = ("Strain", "StudyLog")
readonly_admin_pages = [
    (site, model, model_admin)
    for site in all_sites
    for model, model_admin in site._registry.items()
    if model.__name__ in readonly_names
]
writable_admin_pages = [
    (site, model, model_admin)
    for site in all_sites
    for model, model_admin in site._registry.items()
    if model.__name__ not in readonly_names
]
all_admin_pages = readonly_admin_pages + writable_admin_pages


def admin_url(site, model, page):
    app = model._meta.app_label
    name = model._meta.model_name
    return reverse(f"{site.name}:{app}_{name}_{page}")


@fixture
def admin_user(db):
    return factory.UserFactory(is_superuser=True, is_staff=True)


@mark.parametrize("site,model,model_admin", readonly_admin_pages)
def test_admin_add_for_readonly(client, admin_user, site, model, model_admin):
    client.force_login(admin_user)
    url = admin_url(site, model, "add")

    response = client.get(url)

    # these admins explicitly prohibit adding via admin
    assert response.status_code == HTTPStatus.FORBIDDEN


@mark.parametrize("site,model,model_admin", writable_admin_pages)
def test_admin_add(client, admin_user, site, model, model_admin):
    client.force_login(admin_user)
    url = admin_url(site, model, "add")

    response = client.get(url)

    assert response.status_code == HTTPStatus.OK


@mark.parametrize("site,model,model_admin", all_admin_pages)
def test_admin_changelist(client, admin_user, site, model, model_admin):
    client.force_login(admin_user)
    url = admin_url(site, model, "changelist")

    response = client.get(url)

    assert response.status_code == HTTPStatus.OK
