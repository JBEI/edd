from http import HTTPStatus
from unittest.mock import patch

from rest_framework.reverse import reverse

from main import models as edd_models
from main.tests import factory as main_factory

from .. import tasks

JSON_CONTENT = "application/json"


def test_load_create_unauthenticated(client):
    url = reverse("rest:studies-load", args=[0])
    response = client.post(url, [], content_type=JSON_CONTENT)
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_load_create_without_permission(client, readable_session):
    url = reverse("rest:studies-load", args=[readable_session.study.pk])
    client.force_login(readable_session.user)

    payload = {
        "protocol": "00000000-0000-0000-0000-0000deadbeef",
        "records": [],
    }
    response = client.post(url, payload, content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_load_create_payload_not_json(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    response = client.post(url, "some invalid content", content_type=JSON_CONTENT)

    # fail here at the content_type parsing stage
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "uuid" not in response.data
    # return object has details on error
    assert "detail" in response.data


def test_load_create_payload_invalid(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    response = client.post(url, {"foo": "bar"}, content_type=JSON_CONTENT)

    # fail here at validating the received JSON
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert len(response.data) == 2
    # required field errors
    assert "protocol" in response.data
    assert "records" in response.data


def test_load_create_missing_sample_ids(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    payload = {
        "protocol": "00000000-0000-0000-0000-0000deadbeef",
        "records": [
            # no line or assay id provided
            {
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x_unit_id": 2,
                "x": [24.0],
                "y_unit_id": 1,
                "y": [42.0],
            },
            # again
            {
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x_unit_id": 2,
                "x": [48.0],
                "y_unit_id": 1,
                "y": [84.0],
            },
        ],
    }
    response = client.post(url, payload, content_type=JSON_CONTENT)

    # fail here at validating the received JSON
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "records" in response.data
    assert len(response.data["records"]) == 2
    assert "non_field_errors" in response.data["records"][0]
    assert "non_field_errors" in response.data["records"][1]


def test_load_create_missing_x_unit_ids(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    payload = {
        "protocol": "00000000-0000-0000-0000-0000deadbeef",
        "records": [
            # ok
            {
                "assay_id": "00000000-0000-0000-0000-0000deadbeef",
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x_unit_id": 2,
                "x": [24.0],
                "y_unit_id": 1,
                "y": [42.0],
            },
            # no x_unit provided
            {
                "assay_id": "00000000-0000-0000-0000-0000deadbeef",
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x": [48.0],
                "y_unit_id": 1,
                "y": [84.0],
            },
        ],
        # no default units provided
    }
    response = client.post(url, payload, content_type=JSON_CONTENT)

    # fail here at validating the received JSON
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "non_field_errors" in response.data
    assert "X unit ID" in response.data["non_field_errors"][0]


def test_load_create_missing_y_unit_ids(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    payload = {
        "protocol": "00000000-0000-0000-0000-0000deadbeef",
        "records": [
            # ok
            {
                "assay_id": "00000000-0000-0000-0000-0000deadbeef",
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x_unit_id": 2,
                "x": [24.0],
                "y_unit_id": 1,
                "y": [42.0],
            },
            # no y_unit provided
            {
                "assay_id": "00000000-0000-0000-0000-0000deadbeef",
                "type_id": "00000000-0000-0000-0000-0000deadbeef",
                "x_unit_id": 2,
                "x": [48.0],
                "y": [84.0],
            },
        ],
        # no default units provided
    }
    response = client.post(url, payload, content_type=JSON_CONTENT)

    # fail here at validating the received JSON
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "non_field_errors" in response.data
    assert "Y unit ID" in response.data["non_field_errors"][0]


def test_load_create_empty(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    payload = {
        "protocol": "00000000-0000-0000-0000-0000deadbeef",
        "records": [],
    }
    response = client.post(url, payload, content_type=JSON_CONTENT)

    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:load-detail", args=[response.data["uuid"]])


def test_load_create_simple(client, writable_session):
    url = reverse("rest:studies-load", args=[writable_session.study.pk])
    client.force_login(writable_session.user)

    type_id = main_factory.MeasurementTypeFactory().uuid
    protocol = main_factory.ProtocolFactory()
    # built-in bootstrap data includes n/a and hours as units 1 and 2, respectively
    x_unit = 2
    y_unit = 1
    assay_1 = main_factory.AssayFactory(study=writable_session.study, protocol=protocol)
    line_2 = main_factory.LineFactory(study=writable_session.study)
    assay_3 = main_factory.AssayFactory(study=writable_session.study, protocol=protocol)
    line_3 = assay_3.line
    payload = {
        "protocol": protocol.uuid,
        "records": [
            # works with an assay ID only
            {
                "assay_id": assay_1.uuid,
                "type_id": type_id,
                "x_unit_id": x_unit,
                "x": [24.0],
                "y_unit_id": y_unit,
                "y": [42.0],
            },
            # works with a line ID only
            {
                "line_id": line_2.uuid,
                "type_id": type_id,
                "x_unit_id": x_unit,
                "x": [24.0],
                "y_unit_id": y_unit,
                "y": [98.3],
            },
            # works when not providing unit IDs directly
            {
                "assay_id": assay_3.uuid,
                "line_id": line_3.uuid,
                "type_id": type_id,
                "x": [24.0],
                "y": [9000.1],
            },
        ],
        "x_unit_id": x_unit,
        "y_unit_id": y_unit,
    }

    # patching to avoid actually submitting task
    with patch("edd.load.tasks.run_rest_import") as task:
        response = client.post(url, payload, content_type=JSON_CONTENT)

    print(response.data)
    assert response.status_code == HTTPStatus.OK
    assert "uuid" in response.data
    assert response.data["url"] == reverse("rest:load-detail", args=[response.data["uuid"]])
    task.delay.assert_called_once()

    # call the task directly to confirm behavior
    tasks.run_rest_import(*task.delay.call_args.args)
    assert edd_models.Measurement.objects.filter(study=writable_session.study).count() == 3
