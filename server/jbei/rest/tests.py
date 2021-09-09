import pytest

from . import auth


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
