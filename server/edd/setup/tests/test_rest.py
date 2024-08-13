from http import HTTPStatus
from unittest.mock import patch

from rest_framework.reverse import reverse

from main import models as edd_models
from main.tests.factory import MetadataTypeFactory, ProtocolFactory

from .. import tasks

JSON_CONTENT = "application/json"


def test_setup_create_unauthenticated(client):
    url = reverse("rest:studies-setup", args=[0])
    response = client.post(url, [], content_type=JSON_CONTENT)
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_setup_create_without_permission(client, readable_session):
    url = reverse("rest:studies-setup", args=[readable_session.study.pk])
    client.force_login(readable_session.user)

    response = client.post(url, [], content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_setup_create_payload_not_json(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    response = client.post(url, "some invalid content", content_type=JSON_CONTENT)

    # fail here at the content_type parsing stage
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "uuid" not in response.data
    # return object has details on error
    assert "detail" in response.data


def test_setup_create_payload_invalid(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    response = client.post(url, [{"foo": "bar"}], content_type=JSON_CONTENT)

    # fail here at validating the received JSON
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert len(response.data) == 1
    # required field error
    assert "name" in response.data[0]


def test_setup_create_empty(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    response = client.post(url, [], content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:setup-detail", args=[response.data["uuid"]])


def test_setup_create_simple(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    payload = [
        {"name": "A"},
        {"name": "B", "replicates": 3},
    ]
    client.force_login(writable_session.user)

    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_rest_payload") as task:
        response = client.post(url, payload, content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:setup-detail", args=[response.data["uuid"]])
    task.delay.assert_called_once()

    # call the task directly to confirm behavior
    tasks.setup_rest_payload(*task.delay.call_args.args)
    assert writable_session.study.line_set.count() == 4


def test_setup_create_with_assays(client, writable_session):
    protocol = ProtocolFactory()
    assay_meta = MetadataTypeFactory(for_context="A")
    assay_name = edd_models.MetadataType.system("Assay Name")
    payload = [
        {
            "name": "A",
            "assays": {
                str(protocol.uuid): [
                    [
                        {"uuid": str(assay_name.uuid), "value": "A1"},
                        {"uuid": str(assay_meta.uuid), "value": "foobar"},
                    ],
                    [
                        {"uuid": str(assay_name.uuid), "value": "A2"},
                        {"uuid": str(assay_meta.uuid), "value": "foobar"},
                    ],
                ],
            },
        },
        {
            "name": "B",
            "assays": {
                str(protocol.uuid): [
                    [
                        {"uuid": str(assay_name.uuid), "value": "B1"},
                        {"uuid": str(assay_meta.uuid), "value": "foobar"},
                    ],
                    [
                        {"uuid": str(assay_name.uuid), "value": "B2"},
                        {"uuid": str(assay_meta.uuid), "value": "foobar"},
                    ],
                    [
                        {"uuid": str(assay_name.uuid), "value": "B3"},
                        {"uuid": str(assay_meta.uuid), "value": "foobar"},
                    ],
                ],
            },
        },
        # support empty assays
        {"name": "C", "assays": {}},
    ]
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_rest_payload") as task:
        response = client.post(url, payload, content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:setup-detail", args=[response.data["uuid"]])
    task.delay.assert_called_once()

    # call the task directly to confirm behavior
    tasks.setup_rest_payload(*task.delay.call_args.args)
    assert writable_session.study.line_set.count() == 3
    A = edd_models.Line.objects.get(study_id=writable_session.study.id, name="A")
    B = edd_models.Line.objects.get(study_id=writable_session.study.id, name="B")
    C = edd_models.Line.objects.get(study_id=writable_session.study.id, name="C")
    assert A.assay_set.count() == 2
    assert B.assay_set.count() == 3
    assert C.assay_set.count() == 0


def test_setup_create_with_invalid_metadata(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    payload = [
        {
            "name": "A",
            "meta": [{"uuid": "00000000-0000-0000-0000-0000deadbeef", "value": "whatever"}],
        },
        {
            "name": "B",
            "meta": [{"uuid": "00000000-0000-0000-0000-1111deadbeef", "value": "something"}],
        },
    ]
    client.force_login(writable_session.user)

    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_rest_payload") as task:
        response = client.post(url, payload, content_type=JSON_CONTENT)

    # the uuids on metadata still parse *as* UUID, so gets past first stage of validation
    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:setup-detail", args=[response.data["uuid"]])
    task.delay.assert_called_once()

    # call the task directly to ensure invalid metadata isn't saved
    tasks.setup_rest_payload(*task.delay.call_args.args)
    assert writable_session.study.line_set.count() == 0


def test_setup_progress_after_create(client, writable_session):
    url = reverse("rest:studies-setup", args=[writable_session.study.pk])
    payload = [
        {"name": "A"},
        {"name": "B", "replicates": 3},
    ]
    client.force_login(writable_session.user)

    # patching to avoid actually submitting task
    with patch("edd.setup.tasks.setup_rest_payload") as task:
        response = client.post(url, payload, content_type=JSON_CONTENT)

    # now can check the progress
    progress = client.get(response.data["url"])
    assert progress.status_code == HTTPStatus.OK
    assert "resolved" in progress.data
    assert "unresolved" in progress.data
    assert "saved" in progress.data
    assert progress.data["status"] == "Created"

    # call the task directly to see updates
    tasks.setup_rest_payload(*task.delay.call_args.args)
    progress = client.get(response.data["url"])
    assert progress.status_code == HTTPStatus.OK
    assert "resolved" in progress.data
    assert "unresolved" in progress.data
    assert progress.data["status"] == "Done"
    assert progress.data["saved"]["assays"] == 0
    assert progress.data["saved"]["lines"] == 4
    assert progress.data["saved"]["records"] == 2
