import pytest

from . import auth, sessions
from .clients.ice import api


def test_HmacAuth_key_deregistration():
    auth.HmacAuth.register_key("fake", b"12345678")
    fake = auth.HmacAuth("fake")
    assert fake
    auth.HmacAuth.deregister_key("fake")
    with pytest.raises(ValueError):
        fake = auth.HmacAuth("fake")


class FakeRequest:
    def __init__(
        self, body=None, headers=None, method="GET", url="https://www.example.com/"
    ):
        self.body = body
        self.headers = {} if headers is None else dict(headers)
        self.method = method
        self.url = url


def test_HmacAuth_simple_signature():
    auth.HmacAuth.register_key("fake", b"12345678")
    # create a fake auth object
    fake = auth.HmacAuth("fake")
    # create a fake request object
    request = FakeRequest()
    # verify signature generation
    request = fake(request)
    assert request.headers["Authorization"] == "1:fake::/GdqX6+zllPT+ADHUfpYI/+HUN8="


def test_HmacAuth_query_param_signature():
    auth.HmacAuth.register_key("fake", b"12345678")
    # create a fake auth object
    fake = auth.HmacAuth("fake")
    # create a fake request object
    request = FakeRequest(url="https://www.example.com/?param=1")
    # verify signature generation
    request = fake(request)
    assert request.headers["Authorization"] == "1:fake::h3Uk7B4l+83AKR/C8fyC/WU3II8="


def test_HmacAuth_different_users():
    auth.HmacAuth.register_key("fake", b"12345678")
    # create fake auth objects, different users
    alice = auth.HmacAuth("fake", username="alice")
    betty = auth.HmacAuth("fake", username="betty")
    # create a fake request object
    alice_request = FakeRequest()
    betty_request = FakeRequest()
    # verify signature generation
    alice_request = alice(alice_request)
    betty_request = betty(betty_request)
    alice_sig = alice_request.headers["Authorization"]
    betty_sig = betty_request.headers["Authorization"]
    # check that the signature parts near the end are different
    assert alice_sig[-20:] != betty_sig[-20:]
    assert "alice" in alice_sig
    assert "betty" in betty_sig


def test_HmacAuth_string_body():
    auth.HmacAuth.register_key("fake", b"12345678")
    # create a fake auth object
    fake = auth.HmacAuth("fake")
    # create a fake request object
    request = FakeRequest(body="some body text", method="POST")
    # verify signature generation
    request = fake(request)
    assert request.headers["Authorization"] == "1:fake::a8JtB9GIHsb9neaRvO37xFYKjlM="


def test_HmacAuth_bytes_body():
    auth.HmacAuth.register_key("fake", b"12345678")
    # create a fake auth object
    fake = auth.HmacAuth("fake")
    # create a fake request object
    request = FakeRequest(body=b"some body bytes", method="POST")
    # verify signature generation
    request = fake(request)
    assert request.headers["Authorization"] == "1:fake::hJ9LGdRihldx9C0aeAxPV5JJIpc="


def test_Session_defaults():
    fake_auth = object()
    # Session wrapper sets default values if not explicitly set on requests
    s = sessions.Session(timeout=(30, 30), verify_ssl_cert=False, auth=fake_auth)
    # verify that same defaults are added if not explicitly listed
    blank = s._set_defaults()
    assert blank == {"timeout": (30, 30), "verify": False, "auth": fake_auth}
    # verify that explicit timeout is preserved
    with_timeout = s._set_defaults(timeout=(10, 10))
    assert with_timeout == {"timeout": (10, 10), "verify": False, "auth": fake_auth}
    # verify that explicit TLS verification is preserved
    with_verify = s._set_defaults(verify=True)
    assert with_verify == {"timeout": (30, 30), "verify": True, "auth": fake_auth}
    # verify that explicit auth is preserved
    other_auth = object()
    with_auth = s._set_defaults(auth=other_auth)
    assert with_auth == {"timeout": (30, 30), "verify": False, "auth": other_auth}


def test_Entry_missing_fields():
    entry = api.Entry()
    assert entry.access_permissions == []
    assert entry.keywords == []
    assert entry.linked_parts == []
    assert entry.links == []
    assert entry.parents == []


def test_Entry_of_None():
    entry = api.Entry.of(None)
    assert entry is None


def test_Entry_json_convert_empty():
    entry = api.Entry()
    assert entry.to_json_dict() == {
        "keywords": [],
        "linked_parts": [],
        "links": [],
        "parents": [],
    }


def test_Entry_json_convert():
    input_json = {
        "alias": "",
        "bioSafetyLevel": 1,
        "canEdit": True,
        "creationTime": 1563590257554,
        "creator": "Nathan J. Hillson",
        "creatorEmail": "njhillson@lbl.gov",
        "customFields": [],
        "fundingSource": "DOE JGI",
        "id": 800,
        "index": 0,
        "keywords": "",
        "linked_parts": [],
        "links": [],
        "modificationTime": 1563590257660,
        "name": "peU_HSBC_NcoI_RAH_GD",
        "owner": " Administrator",
        "ownerEmail": "Administrator",
        "ownerId": 1,
        "parents": [],
        "partId": "TEST_000800",
        "principalInvestigator": "Nathan Hillson",
        "principalInvestigatorEmail": "njhillson@lbl.gov",
        "recordId": "66dab63b-7b0e-4949-9498-24da495df4ce",
        "selectionMarkers": ["Carbenicillin"],
        "shortDescription": "DOE JGI DNA Synthesis Program standard vector. "
        "Insertion at NcoI site.",
        "status": "Complete",
        "visible": "OK",
    }
    input_json_with_type = {"type": "PART"}
    input_json_with_type.update(input_json)
    entry = api.Entry.of(input_json_with_type)
    assert entry.to_json_dict() == input_json


def test_Entry_json_with_parents_no_partId():
    # ICE does not set "partId" on parent entries
    input_json = {
        "id": 800,
        "linked_parts": [],
        "links": [],
        "modificationTime": 1563590257660,
        "parents": [{"id": 109878, "type": "STRAIN"}, {"id": 109879, "type": "STRAIN"}],
        "partId": "TEST_000800",
        "recordId": "66dab63b-7b0e-4949-9498-24da495df4ce",
        "type": "PLASMID",
    }
    entry = api.Entry.of(input_json)
    assert entry.part_id == "TEST_000800"
    assert len(entry.parents) == 2


def test_IceApi_requires_auth():
    with pytest.raises(ValueError):
        api.IceApi(auth=None)


def test_Folder_json_convert():
    input_json = {
        "canEdit": False,
        "count": 0,
        "creationTime": 1563576614389,
        "entries": [],
        "folderName": "test",
        "id": 1,
        "propagatePermission": False,
    }
    folder = api.Folder.of(input_json)
    assert folder.to_json_dict() == input_json


def test_Strain_json_convert():
    input_json = {
        "alias": None,
        "bioSafetyLevel": 1,
        "canEdit": True,
        "creationTime": 1563479450054,
        "creator": "Alberto Nava",
        "creatorEmail": "aanava@lbl.gov",
        "creatorId": 670,
        "id": 106943,
        "index": 0,
        "intellectualProperty": "N/A",
        "keywords": [],
        "linked_parts": [],
        "links": [],
        "modificationTime": 1563488022952,
        "name": "himastat_pmq30_295",
        "owner": "Alberto Nava",
        "ownerEmail": "aanava@lbl.gov",
        "ownerId": 670,
        "parents": [],
        "partId": "JBx_106943",
        "principalInvestigator": "Jay Keasling",
        "principalInvestigatorEmail": "jdkeasling@lbl.gov",
        "principalInvestigatorId": 47,
        "recordId": "a4dae0a8-4d02-4564-ad76-c9f868631840",
        "references": None,
        "selectionMarkers": ["Gent"],
        "shortDescription": (
            "E. coli carrying Yeast Assembled Plasmid consisting of parts: "
            "(T7-lipLM-linker) + (DebsM2_KS_AT) + (DebsM2_KR_ACP) + "
            "(linker_ctg2_M2-noTE) + (zeaTE_NOstop) + (pMQ30_linear_ndeI_xhoI.gb)"
        ),
        "status": "In Progress",
        "strainData": {"host": "E. coli", "genotypePhenotype": "DH10-beta"},
        "visible": "OK",
    }
    input_json_with_type = {"type": "STRAIN"}
    input_json_with_type.update(input_json)
    strain = api.Entry.of(input_json_with_type)
    assert strain.to_json_dict() == input_json
