from http import HTTPStatus

from django.urls import reverse
from pytest import fixture, mark
from pytest_django import asserts

from .. import models
from . import factory


class StudySession:
    """
    Defines the basic records required to test viewing a Study. Provides a
    generated user, with configurable permission level to a generated study.
    """

    def __init__(self, permission_type=models.StudyPermission.READ):
        self.user = factory.UserFactory()
        self.study = factory.StudyFactory()
        self.study.userpermission_set.update_or_create(
            user=self.user,
            defaults={"permission_type": permission_type},
        )

    def url(self, name):
        return reverse(name, kwargs={"slug": self.study.slug})


@fixture
def readable_session(db):
    return StudySession()


@fixture
def writable_session(db):
    return StudySession(permission_type=models.StudyPermission.WRITE)


def test_get(client, readable_session):
    url = readable_session.url("main:lines")
    client.force_login(readable_session.user)

    response = client.get(url)

    asserts.assertContains(response, readable_session.study.name)
    asserts.assertTemplateUsed(response, "main/study-description.html")


def test_empty_post(client, readable_session):
    url = readable_session.url("main:lines")
    client.force_login(readable_session.user)

    response = client.post(url, data={})

    # no POST to initial view, using individual sub-views with own URLs now
    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_create_line_get_without_permission(client, readable_session):
    url = readable_session.url("main:new_line")
    client.force_login(readable_session.user)

    response = client.get(url)

    assert response.status_code == HTTPStatus.FORBIDDEN


@mark.parametrize(
    "url_name",
    [
        "main:new_line",
        "main:new_line_ajax",
        "main:line_start",
        "main:line_edit",
        "main:line_edit_ajax",
        "main:assay_start",
        "main:assay_add",
        "main:assay_add_ajax",
        "main:line_clone",
        "main:line_group",
        "main:line_ungroup",
        "main:line_delete",
        "main:line_restore",
    ],
)
def test_views_post_without_permission(client, readable_session, url_name):
    url = readable_session.url(url_name)
    client.force_login(readable_session.user)

    response = client.post(url)

    assert response.status_code == HTTPStatus.FORBIDDEN


@mark.parametrize(
    "url_name",
    [
        "main:line_start",
        "main:line_edit",
        "main:line_edit_ajax",
        "main:assay_start",
        "main:assay_add",
        "main:assay_add_ajax",
        "main:line_clone",
        "main:line_group",
        "main:line_ungroup",
        "main:line_delete",
        "main:line_restore",
    ],
)
def test_get_on_post_only_views(client, readable_session, url_name):
    url = readable_session.url(url_name)
    client.force_login(readable_session.user)

    response = client.get(url)

    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_create_line_get(client, writable_session):
    url = writable_session.url("main:new_line")
    client.force_login(writable_session.user)

    response = client.get(url, follow=True)

    assert response.status_code == HTTPStatus.OK
    asserts.assertRedirects(response, writable_session.url("main:lines"))
    asserts.assertTemplateUsed(response, "main/study-description.html")
    # page only shows form when the form has errors
    asserts.assertTemplateNotUsed(response, "main/include/studydesc-line.html")


def test_create_line_get_ajax(client, writable_session):
    url = writable_session.url("main:new_line_ajax")
    client.force_login(writable_session.user)

    response = client.get(url)

    assert response.status_code == HTTPStatus.OK
    asserts.assertTemplateNotUsed(response, "main/study-description.html")
    asserts.assertTemplateUsed(response, "main/include/studydesc-line.html")


def test_create_line_post_without_payload(client, writable_session):
    url = writable_session.url("main:new_line")
    client.force_login(writable_session.user)

    response = client.post(url, data={}, follow=True)

    assert writable_session.study.line_set.count() == 0
    asserts.assertContains(response, "EDD could not save line information.")
    asserts.assertTemplateUsed(response, "main/study-description.html")
    # redirect loses context of invalid form, so form should *not* render
    asserts.assertTemplateNotUsed(response, "main/include/studydesc-line.html")
    asserts.assertRedirects(response, writable_session.url("main:lines"))


def test_create_line_post_ajax_without_payload(client, writable_session):
    url = writable_session.url("main:new_line_ajax")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert writable_session.study.line_set.count() == 0
    asserts.assertTemplateNotUsed(response, "main/study-description.html")
    asserts.assertTemplateUsed(response, "main/include/studydesc-line.html")
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_create_line_post_ajax(client, writable_session):
    url = writable_session.url("main:new_line_ajax")
    client.force_login(writable_session.user)
    name = factory.fake.catch_phrase()

    response = client.post(url, data={"name": name})

    assert writable_session.study.line_set.count() == 1
    assert response.status_code == HTTPStatus.OK


def test_edit_line_without_selection(client, writable_session):
    url = writable_session.url("main:line_edit")
    client.force_login(writable_session.user)

    response = client.post(url, data={}, follow=True)

    asserts.assertRedirects(response, writable_session.url("main:lines"))
    asserts.assertContains(response, "EDD could not verify lines to modify.")


def test_edit_line_without_selection_inline(client, writable_session):
    url = writable_session.url("main:line_edit_ajax")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    asserts.assertContains(
        response,
        "EDD could not verify lines to modify.",
        status_code=HTTPStatus.BAD_REQUEST,
    )
    asserts.assertTemplateUsed(response, "main/include/error_message.html")


def test_edit_single_line(client, writable_session):
    url = writable_session.url("main:line_edit_ajax")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    new_name = f"edited {line.name}"
    payload = {"lineId": [line.id], "name": new_name}
    response = client.post(url, data=payload)

    updated = models.Line.objects.get(pk=line.id)
    assert response.status_code == HTTPStatus.OK
    assert updated.name == new_name


def test_edit_single_line_with_invalid_form(client, writable_session):
    url = writable_session.url("main:line_edit_ajax")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    # name is required, form will be invalid
    payload = {"lineId": [line.id], "name": ""}
    response = client.post(url, data=payload)

    asserts.assertContains(
        response,
        "This field is required.",
        status_code=HTTPStatus.BAD_REQUEST,
    )
    asserts.assertTemplateUsed(response, "main/include/studydesc-line.html")
    asserts.assertTemplateNotUsed(response, "main/study-description.html")


def test_edit_single_line_metadata_add_remove(client, writable_session):
    url = writable_session.url("main:line_edit_ajax")
    meta_a = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
    meta_b = factory.MetadataTypeFactory(for_context=models.MetadataType.LINE)
    start_meta = {meta_a.pk: "foo"}
    line = factory.LineFactory(study=writable_session.study, metadata=start_meta)
    client.force_login(writable_session.user)

    payload = {
        "lineId": [line.id],
        f"meta_{meta_a.pk}_remove": "on",
        f"meta_{meta_a.pk}_set": "foo",
        f"meta_{meta_b.pk}_set": "bar",
        "name": line.name,
        "selected_meta": [meta_a.id, meta_b.id],
    }
    response = client.post(url, data=payload)

    updated = models.Line.objects.get(pk=line.id)
    assert response.status_code == HTTPStatus.OK
    assert updated.name == line.name
    assert len(updated.metadata) == 1
    assert updated.metadata_get(meta_b) == "bar"


def test_initial_edit_line_without_selection(client, writable_session):
    url = writable_session.url("main:line_start")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST
    asserts.assertTemplateUsed(response, "main/include/error_message.html")
    asserts.assertTemplateNotUsed(response, "main/study-description.html")


def test_initial_edit_multiple_lines_prefill(client, writable_session):
    url = writable_session.url("main:line_start")
    description = factory.fake.catch_phrase()
    line1 = factory.LineFactory(description=description, study=writable_session.study)
    line2 = factory.LineFactory(description=description, study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id]}
    response = client.post(url, data=payload)

    # edit form pre-fills the description shared by the lines
    asserts.assertContains(response, description)
    # neither line name is present
    asserts.assertNotContains(response, line1.name)
    asserts.assertNotContains(response, line2.name)
    asserts.assertTemplateNotUsed(response, "main/study-description.html")
    asserts.assertTemplateUsed(response, "main/include/studydesc-line.html")


def test_edit_multiple_lines(client, writable_session):
    url = writable_session.url("main:line_edit_ajax")
    line1 = factory.LineFactory(control=False, study=writable_session.study)
    line2 = factory.LineFactory(control=False, study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id], "control": True}
    response = client.post(url, data=payload)

    found = models.Line.objects.filter(pk__in=[line1.id, line2.id], control=True)
    assert response.status_code == HTTPStatus.OK
    assert found.count() == 2


def test_delete_line_without_selection(client, writable_session):
    url = writable_session.url("main:line_delete")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_delete_single_line_without_measurements(client, writable_session):
    url = writable_session.url("main:line_delete")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    found = models.Line.objects.filter(pk=line.id)
    assert response.status_code == HTTPStatus.OK
    assert found.count() == 0


def test_delete_multiple_lines_without_measurements(client, writable_session):
    url = writable_session.url("main:line_delete")
    line1 = factory.LineFactory(study=writable_session.study)
    line2 = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id]}
    response = client.post(url, data=payload)

    found = models.Line.objects.filter(pk__in=[line1.id, line2.id])
    assert response.status_code == HTTPStatus.OK
    assert found.count() == 0


def test_delete_multiple_lines_with_measurements(client, writable_session):
    url = writable_session.url("main:line_delete")
    factory.create_fake_exportable_study(writable_session.study, lines_count=3)
    lines = writable_session.study.line_set
    client.force_login(writable_session.user)

    payload = {"lineId": lines.values_list("id", flat=True)}
    response = client.post(url, data=payload)

    assert response.status_code == HTTPStatus.OK
    assert lines.count() == 3
    assert lines.filter(active=True).count() == 0


def test_delete_already_archived_line(client, writable_session):
    url = writable_session.url("main:line_delete")
    factory.create_fake_exportable_study(writable_session.study, lines_count=3)
    lines = writable_session.study.line_set
    client.force_login(writable_session.user)

    payload = {"lineId": lines.values_list("id", flat=True)}
    # doing POST twice simulates delete on archived line
    response = client.post(url, data=payload)
    response = client.post(url, data=payload)

    assert response.status_code == HTTPStatus.OK
    assert lines.count() == 3
    assert lines.filter(active=True).count() == 0


def test_restore_line_without_selection(client, writable_session):
    url = writable_session.url("main:line_restore")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_restore_single_line(client, writable_session):
    url = writable_session.url("main:line_restore")
    line = factory.LineFactory(study=writable_session.study, active=False)
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    assert response.status_code == HTTPStatus.OK
    assert writable_session.study.line_set.filter(active=True).count() == 1


def test_restore_multiple_lines(client, writable_session):
    url = writable_session.url("main:line_restore")
    factory.create_fake_exportable_study(writable_session.study, lines_count=3)
    lines = writable_session.study.line_set
    lines.update(active=False)
    client.force_login(writable_session.user)

    payload = {"lineId": lines.values_list("id", flat=True)}
    response = client.post(url, data=payload)

    assert response.status_code == HTTPStatus.OK
    assert lines.filter(active=True).count() == 3


def test_restore_active_line(client, writable_session):
    url = writable_session.url("main:line_restore")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    found = models.Line.objects.filter(pk=line.id, active=True)
    assert response.status_code == HTTPStatus.OK
    assert found.count() == 1


def test_group_lines_without_selection(client, writable_session):
    url = writable_session.url("main:line_group")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_group_single_line(client, writable_session):
    url = writable_session.url("main:line_group")
    line = factory.LineFactory(study=writable_session.study)
    replicate = models.MetadataType.system("Replicate")
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    found = models.Line.objects.get(pk=line.id)
    assert response.status_code == HTTPStatus.OK
    assert found.metadata_get(replicate) is not None


def test_group_multiple_lines(client, writable_session):
    url = writable_session.url("main:line_group")
    line1 = factory.LineFactory(study=writable_session.study)
    line2 = factory.LineFactory(study=writable_session.study)
    replicate = models.MetadataType.system("Replicate")
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id]}
    response = client.post(url, data=payload)

    found1 = models.Line.objects.get(pk=line1.id)
    found2 = models.Line.objects.get(pk=line2.id)
    assert response.status_code == HTTPStatus.OK
    assert found1.metadata_get(replicate) is not None
    assert found1.metadata_get(replicate) == found2.metadata_get(replicate)


def test_group_already_grouped_lines(client, writable_session):
    url = writable_session.url("main:line_group")
    replicate = models.MetadataType.system("Replicate")
    line1 = factory.LineFactory(
        metadata={replicate.pk: "foo"},
        study=writable_session.study,
    )
    line2 = factory.LineFactory(
        metadata={replicate.pk: "bar"},
        study=writable_session.study,
    )
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id]}
    response = client.post(url, data=payload)

    found1 = models.Line.objects.get(pk=line1.id)
    found2 = models.Line.objects.get(pk=line2.id)
    assert response.status_code == HTTPStatus.OK
    assert found1.metadata_get(replicate) != "foo"
    assert found2.metadata_get(replicate) != "bar"
    assert found1.metadata_get(replicate) == found2.metadata_get(replicate)


def test_ungroup_lines_without_selection(client, writable_session):
    url = writable_session.url("main:line_ungroup")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_ungroup_single_line(client, writable_session):
    url = writable_session.url("main:line_ungroup")
    replicate = models.MetadataType.system("Replicate")
    line = factory.LineFactory(
        metadata={replicate.pk: "foo"},
        study=writable_session.study,
    )
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    found = models.Line.objects.get(pk=line.id)
    assert response.status_code == HTTPStatus.OK
    assert found.metadata_get(replicate) is None


def test_ungroup_multiple_lines(client, writable_session):
    url = writable_session.url("main:line_ungroup")
    replicate = models.MetadataType.system("Replicate")
    line1 = factory.LineFactory(
        metadata={replicate.pk: "foo"},
        study=writable_session.study,
    )
    line2 = factory.LineFactory(
        metadata={replicate.pk: "bar"},
        study=writable_session.study,
    )
    client.force_login(writable_session.user)

    payload = {"lineId": [line1.id, line2.id]}
    response = client.post(url, data=payload)

    found1 = models.Line.objects.get(pk=line1.id)
    found2 = models.Line.objects.get(pk=line2.id)
    assert response.status_code == HTTPStatus.OK
    assert found1.metadata_get(replicate) is None
    assert found2.metadata_get(replicate) is None


def test_clone_line_without_selection(client, writable_session):
    url = writable_session.url("main:line_clone")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_clone_line(client, writable_session):
    url = writable_session.url("main:line_clone")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    assert writable_session.study.line_set.count() == 2
    values = writable_session.study.line_set.values_list("description", flat=True)
    assert values[0] == values[1]
    assert response.status_code == HTTPStatus.OK


def test_initial_add_assay_without_selection(client, writable_session):
    url = writable_session.url("main:assay_start")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    asserts.assertContains(
        response,
        "Must select at least one Line to add Assay.",
        status_code=HTTPStatus.BAD_REQUEST,
    )
    asserts.assertTemplateUsed(response, "main/include/error_message.html")


def test_initial_add_assay(client, writable_session):
    url = writable_session.url("main:assay_start")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    asserts.assertTemplateNotUsed(response, "main/study-description.html")
    asserts.assertTemplateUsed(response, "main/include/studydesc-assay.html")
    assert response.status_code == HTTPStatus.OK


def test_add_assay_without_selection(client, writable_session):
    url = writable_session.url("main:assay_add")
    client.force_login(writable_session.user)

    response = client.post(url, data={}, follow=True)

    asserts.assertRedirects(response, writable_session.url("main:lines"))
    asserts.assertContains(response, "Must select at least one Line to add Assay.")


def test_add_assay_ajax_without_selection(client, writable_session):
    url = writable_session.url("main:assay_add_ajax")
    client.force_login(writable_session.user)

    response = client.post(url, data={})

    asserts.assertContains(
        response,
        "Must select at least one Line to add Assay.",
        status_code=HTTPStatus.BAD_REQUEST,
    )
    asserts.assertTemplateUsed(response, "main/include/error_message.html")


def test_add_assay_with_invalid_form(client, writable_session):
    url = writable_session.url("main:assay_add")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    # missing protocol
    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload, follow=True)

    asserts.assertRedirects(response, writable_session.url("main:lines"))
    asserts.assertContains(response, "EDD failed to add assays.")


def test_add_assay_ajax_with_invalid_form(client, writable_session):
    url = writable_session.url("main:assay_add_ajax")
    line = factory.LineFactory(study=writable_session.study)
    client.force_login(writable_session.user)

    # missing protocol
    payload = {"lineId": [line.id]}
    response = client.post(url, data=payload)

    asserts.assertTemplateNotUsed(response, "main/study-description.html")
    asserts.assertTemplateUsed(response, "main/include/studydesc-assay.html")
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_add_assay(client, writable_session):
    url = writable_session.url("main:assay_add")
    line = factory.LineFactory(study=writable_session.study)
    protocol = factory.ProtocolFactory()
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id], "protocol": protocol.id}
    response = client.post(url, data=payload, follow=True)

    assert line.assay_set.count() == 1
    assert response.status_code == HTTPStatus.OK
    asserts.assertRedirects(response, writable_session.url("main:lines"))


def test_add_assay_ajax(client, writable_session):
    url = writable_session.url("main:assay_add_ajax")
    line = factory.LineFactory(study=writable_session.study)
    protocol = factory.ProtocolFactory()
    client.force_login(writable_session.user)

    payload = {"lineId": [line.id], "protocol": protocol.id}
    response = client.post(url, data=payload)

    assert line.assay_set.count() == 1
    assert response.status_code == HTTPStatus.OK
