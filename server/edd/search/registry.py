import json
import logging
import typing
from collections.abc import Iterable
from functools import cache
from itertools import chain

import requests
from django.conf import settings
from django.template.loader import get_template
from requests.sessions import Session

from jbei.rest.auth import HmacAuth
from main import models

from .select2 import Select2

if typing.TYPE_CHECKING:
    from django.contrib.auth import get_user_model

    from edd.profile.models import AppLink

    User: typing.TypeAlias = get_user_model()

logger = logging.getLogger(__name__)


class RegistryError(Exception):
    pass


class Entry:
    def __init__(self, app: "AppLink", payload: dict):
        self.app = app
        self.db_id = payload["id"]
        self.registry_id = payload["recordId"]
        base_url = app.url.rstrip("/")
        self.registry_url = f"{base_url}/entry/{self.db_id}"
        self.name = payload["name"]
        self.part_id = payload["partId"]
        # keep this in case anything needs to look up the other fields
        self.payload = payload


class StrainRegistry:
    def __init__(self, user: "User"):
        self.user = user

    def clean_autocomplete_value(self, value) -> Iterable[models.Strain]:
        match value:
            case [*items]:
                for v in items:
                    yield from self.clean_autocomplete_value(v)
            case {"part_id": part_id}:
                if (strain := self.find_entry(part_id)) is not None:
                    yield strain

    def find_entry(self, part_id: str) -> models.Strain | None:
        for app in self._get_apps():
            if found := self._find_entry_in_app(app, part_id):
                defaults = {"name": found.name, "external_url": found.registry_url}
                strain, created = models.Strain.objects.get_or_create(
                    external_id=found.registry_id,
                    defaults=defaults,
                )
                return strain
        return None

    def is_configured(self) -> bool:
        for app in self._get_apps():
            return True
        return False

    def search(self, term: str) -> list[Entry]:
        # NOTE: we are not supporting paging at all with this API
        # TODO: should do this in an async thread to search in parallel across apps, not serial
        result_groups = [self._search_in_app(app, term) for app in self._get_apps()]
        # best we can do for relevance is sort by relative score across remote servers
        return [v[0] for v in sorted(chain(*result_groups), key=lambda v: v[1] / v[2])]

    def _build_url(self, app: "AppLink", *path: str) -> str:
        base = app.url.rstrip("/")
        return "/".join([base, *path])

    def _find_entry_in_app(self, app: "AppLink", part_id: str) -> Entry | None:
        try:
            url = self._build_url(app, "rest", "parts", part_id)
            response = requests.get(url, headers=self._get_headers(app))
            response.raise_for_status()
            payload = response.json()
            return Entry(app, payload)
        except Exception as e:
            # debug level because we expect that a part ID won't exist in many linked apps
            logger.debug("No part ID found", exc_info=e)
        return None

    def _get_apps(self):
        driver = "edd.search.registry.StrainRegistry"
        yield from self.user.profile.applinks.filter(apptype__driver=driver)

    def _get_headers(self, app, **extra):
        return {
            **extra,
            "X-ICE-API-Token-Client": app.secret_id,
            "X-ICE-API-Token": app.api_token,
        }

    def _search_in_app(self, app: "AppLink", term: str) -> list[tuple[Entry, float, float]]:
        try:
            url = self._build_url(app, "rest", "search")
            search = {
                "parameters": {"sortField": "RELEVANCE"},
                "queryString": term,
            }
            headers = self._get_headers(app, **{"Content-Type": "application/json; charset=utf8"})
            response = requests.post(url, data=json.dumps(search), headers=headers)
            response.raise_for_status()
            raw_results = response.json()["results"]
            return [
                (Entry(app, item["entryInfo"]), item["score"], item["maxScore"])
                for item in raw_results
            ]
        except Exception as e:
            logger.debug("Search failed", exc_info=e)
        return []


@Select2("Registry")
@Select2("Strain")
def strain_autocomplete(request):
    ice = StrainRegistry(request.user)
    template = get_template("edd/search/strain.html")
    return [
        {
            "html": template.render({"part": entry}),
            "id": json.dumps({"part_id": entry.part_id}),
            "text": entry.name,
        }
        for entry in ice.search(request.term)
    ], False


class AdminHmacRegistry:
    """
    An API to an ICE instance that includes admin functions. Only for use with
    integration tests, depends on the default "Administrator" user.
    """

    def __init__(self):
        self.auth = None
        self.session = None

    def __enter__(self):
        self.session = Session()
        self.session.auth = self.auth

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self.logout()

    @property
    def base_url(self):
        try:
            url = getattr(settings, "ICE_URL", None)
            # strip trailing slash, if present
            if url[-1] == "/":
                return url[:-1]
            return url
        except Exception as e:
            raise RegistryError("No configured Registry found") from e

    def build_ice_user_record(self, user, **extra):
        # these fields are all required for ICE
        return {
            "firstName": user.first_name,
            "lastName": user.last_name,
            "initials": user.initials,
            "description": "",
            "institution": "",
            "email": user.email,
            "password": "",
            **extra,
        }

    def bulk_upload(self, file):
        self._check_session()
        # create the upload session
        response = self.session.put(self._rest("uploads"), json={"type": "strain"})
        response.raise_for_status()
        upload_id = response.json()["id"]
        # add the file
        response = self.session.post(
            self._rest(f"uploads/{upload_id}/file"),
            files={"type": "strain", "file": file},
        )
        response.raise_for_status()
        # "click" the submit button
        response = self.session.put(
            self._rest(f"uploads/{upload_id}/status"),
            json={"id": upload_id, "status": "APPROVED"},
        )
        response.raise_for_status()

    def create_admin(self, user, **extra):
        user_id = self.create_user(user, **extra)
        payload = self.build_ice_user_record(user, accountType="ADMIN", **extra)
        response = self.session.put(f"{self.base_url}/rest/users/{user_id}", json=payload)
        response.raise_for_status()
        return user_id

    def create_api_key(self, user):
        # need to create a new HmacAuth for specific user
        sub = AdminHmacRegistry()
        with sub.login(username=user.email):
            # POST to /rest/api-keys?client_id=:clientId
            url = f"{sub.base_url}/rest/api-keys"
            # ICE enforces client ID uniqueness, and tests may repeatedly add api keys
            client_id = f"edd.lvh.me-{user.email}-{user.username}"
            response = sub.session.post(url, params={"client_id": client_id})
            response.raise_for_status()
            # response returns clientId + secret + token
            info = response.json()
            user.profile.applinks.create(
                apptype=sub._get_apptype(),
                comment="Generated via edd/search/registry.py",
                secret_id=client_id,
                secret=info["token"],
                url=sub.base_url,
            )

    def create_user(self, user, **extra):
        self._check_session()
        try:
            response = self.session.post(
                f"{self.base_url}/rest/users",
                json=self.build_ice_user_record(user),
                params={"sendEmail": "false"},
            )
            response.raise_for_status()
            created = response.json()
            return created["id"]
        except Exception as e:
            raise RegistryError(f"Failed to create user {user}") from e

    def get_entries(self, collection="available", **extra):
        self._check_session()
        response = self.session.get(
            self._rest(f"collections/{collection}/entries"),
            params={"currentPage": 1, **extra},
        )
        response.raise_for_status()
        return response.json()["data"]

    def get_user_id(self, user):
        self._check_session()
        response = self.session.get(
            f"{self.base_url}/rest/users",
            params={"filter": user.email},
        )
        response.raise_for_status()
        info = response.json()
        if info["resultCount"] != 0:
            return info["users"][0]["id"]
        return None

    def login(self, username="Administrator"):
        key_id = getattr(settings, "ICE_KEY_ID", None)
        secret_key = getattr(settings, "ICE_SECRET_HMAC_KEY", None)
        if key_id and secret_key:
            self.auth = HmacAuth(key_id=key_id, secret_key=secret_key, username=username)
        return self

    def logout(self):
        self.session = None
        self.auth = None
        return self

    def set_permission(self, entry_id, user_id, permission="READ_ENTRY"):
        self._check_session()
        response = self.session.post(
            f"{self.base_url}/rest/parts/{entry_id}/permissions",
            json={
                "article": "ACCOUNT",
                "articleId": user_id,
                "type": permission,
                "typeId": entry_id,
            },
        )
        response.raise_for_status()

    def _check_session(self):
        if self.session is None:
            raise RegistryError("No valid session")

    @cache
    def _get_apptype(self):
        from edd.profile.models import AppType

        at, created = AppType.objects.get_or_create(
            driver="edd.search.registry.StrainRegistry",
            defaults={"display": "ICE"},
        )
        return at

    def _rest(self, *path):
        return "/".join((self.base_url, "rest", *path))


__all__ = [
    AdminHmacRegistry,
    Entry,
    RegistryError,
    StrainRegistry,
]
