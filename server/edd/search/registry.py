import json
import logging
from functools import partial

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from requests.sessions import Session

from jbei.rest.auth import HmacAuth
from main import models

from .select2 import Select2

logger = logging.getLogger(__name__)


class RegistryError(Exception):
    pass


class StrainRegistry:
    # Folder Collections
    FEATURED = "FEATURED"
    PERSONAL = "PERSONAL"
    SHARED = "SHARED"
    # don't care about SAMPLES, PENDING, or DRAFTS
    ALL_COLLECTIONS = (FEATURED, PERSONAL, SHARED)

    def __init__(self):
        self.auth = None
        self.session = None

    def __enter__(self):
        self.session = Session()
        self.session.auth = self.auth

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self.session.close()
        self.session = None

    def build_entry_url(self, entry_id):
        return self._rest(f"parts/{entry_id}")

    def build_folder_url(self, folder_id):
        return self._rest(f"folders/{folder_id}")

    def create_folder(self, folder_name):
        self._check_session()
        try:
            response = self.session.post(
                self._rest("folders"),
                json={"folderName": folder_name},
            )
            response.raise_for_status()
            return Folder(self, response.json())
        except Exception as e:
            raise RegistryError("Could not create folder") from e

    def get_entry(self, entry_id):
        self._check_session()
        try:
            response = self.session.get(self.build_entry_url(entry_id))
            response.raise_for_status()
            return Entry(self, response.json())
        except Exception as e:
            raise RegistryError("Could not load Registry Entry") from e

    def get_folder(self, folder_id):
        self._check_session()
        try:
            response = self.session.get(self.build_folder_url(folder_id))
            response.raise_for_status()
            return Folder(self, response.json())
        except Exception as e:
            raise RegistryError("Could not load Registry Folder") from e

    def iter_entries(self, collection="available", **extra):
        self._check_session()

        def entries_api(start):
            response = self.session.get(
                self._rest(f"collections/{collection}/entries"),
                params={"start": start, **extra},
            )
            response.raise_for_status()
            raw_results = response.json()["data"]
            return [Entry(self, item) for item in raw_results]

        try:
            yield from self._yield_paged_records(entries_api)
        except Exception as e:
            raise RegistryError("Could not iterate Registry Entries") from e

    def list_entries(self, collection="available", **extra):
        self._check_session()
        try:
            response = self.session.get(
                self._rest(f"collections/{collection}/entries"),
                params=extra,
            )
            response.raise_for_status()
            return [Entry(self, item) for item in response.json()["data"]]
        except Exception as e:
            raise RegistryError("Could not list Registry Entries") from e

    def list_folders(self, collection="FEATURED"):
        self._check_session()
        try:
            # this endpoint does not support paging
            response = self.session.get(self._rest(f"collections/{collection}/folders"))
            response.raise_for_status()
            return [Folder(self, item) for item in response.json()]
        except Exception as e:
            raise RegistryError("Could not list Registry Folders") from e

    def login(self, user):
        if key_id := getattr(settings, "ICE_KEY_ID", None):
            self.auth = HmacAuth(key_id=key_id, username=user.email)
        return self

    def logout(self):
        self.auth = None
        return self

    def search(self, term):
        self._check_session()
        try:
            yield from self._yield_paged_records(partial(self.search_page, term))
        except Exception as e:
            raise RegistryError(f"Could not search Registry for {term}") from e

    def search_page(self, term, start):
        self._check_session()
        response = self.session.post(
            self._rest("search"),
            data=json.dumps(
                {
                    "parameters": {"start": start, "sortField": "RELEVANCE"},
                    "queryString": term,
                }
            ),
            headers={"Content-Type": "application/json; charset=utf8"},
        )
        response.raise_for_status()
        raw_results = response.json()["results"]
        return [Entry(self, item["entryInfo"]) for item in raw_results]

    @property
    def base_url(self):
        # short-term: use same environment as exists now to load hard-code value
        # long-term: look up connected registries per user
        try:
            url = getattr(settings, "ICE_URL", None)
            # strip trailing slash, if present
            if url[-1] == "/":
                return url[:-1]
            return url
        except Exception as e:
            raise RegistryError("No configured Registry found") from e

    def _check_session(self):
        if self.session is None:
            raise RegistryError("No valid session")

    def _rest(self, path):
        return f"{self.base_url}/rest/{path}"

    def _yield_paged_records(self, api_call):
        """
        Handles looping over paged API requests, yielding records as a
        generator. The api_call argument should be a function taking the start
        index, and return a list of records for the generator to yield.
        """
        start = 0
        while True:
            results = api_call(start)
            count = len(results)
            if count == 0:
                break
            start = start + count
            yield from results


@Select2("Registry")
@Select2("Strain")
def strain_autocomplete(request):
    ice = StrainRegistry()
    start, end = request.range
    with ice.login(request.user):
        # NOTE: this API only supports starting index,
        # plus gives no indication of further elements
        search = ice.search_page(request.term, start)
        return [{"text": entry.name, **entry.payload} for entry in search], False


class AdminRegistry(StrainRegistry):
    """
    An API to an ICE instance that includes admin functions. Only for use with
    integration tests, depends on the default "Administrator" user.
    """

    def __init__(self):
        self.session = None

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
        try:
            # create the upload session
            response = self.session.put(
                self._rest("uploads"),
                json={"type": "strain"},
            )
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
        except Exception as e:
            raise RegistryError("Could not complete Bulk Upload") from e

    def create_admin(self, user, **extra):
        user_id = self.create_user(user, **extra)
        payload = self.build_ice_user_record(user, accountType="ADMIN", **extra)
        try:
            response = self.session.put(
                f"{self.base_url}/rest/users/{user_id}", json=payload
            )
            response.raise_for_status()
        except Exception as e:
            raise RegistryError(f"Failed to mark {user} as ADMIN") from e
        return user_id

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

    def get_user_id(self, user):
        self._check_session()
        try:
            response = self.session.get(
                f"{self.base_url}/rest/users",
                params={"filter": user.email},
            )
            response.raise_for_status()
            info = response.json()
            if info["resultCount"] != 0:
                return info["users"][0]["id"]
            return None
        except Exception as e:
            raise RegistryError(f"Failed to find user {user}") from e

    def login(self):
        if key_id := getattr(settings, "ICE_KEY_ID", None):
            self.auth = HmacAuth(key_id=key_id, username="Administrator")
        return self


class Entry:
    def __init__(self, registry, payload):
        self.registry = registry
        self.db_id = payload["id"]
        self.registry_id = payload["recordId"]
        self.registry_url = f"{registry.base_url}/entry/{self.db_id}"
        self.name = payload["name"]
        self.part_id = payload["partId"]
        # keep this in case anything needs to look up the other fields
        self.payload = payload

    def add_link(self, label, study_url):
        self.registry._check_session()
        try:
            response = self.registry.session.post(
                self._rest("experiments"),
                data=json.dumps({"label": label, "url": study_url}),
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
        except Exception as e:
            raise RegistryError(f"Failed to add experiment link to {self.db_id}") from e

    def list_links(self):
        self.registry._check_session()
        try:
            # this endpoint does not support paging
            response = self.registry.session.get(self._rest("experiments"))
            response.raise_for_status()
            for item in response.json():
                yield (item["id"], item["label"], item["url"])
        except Exception as e:
            raise RegistryError(
                f"Failed to load experiment links from {self.db_id}"
            ) from e

    def remove_link(self, link_id):
        self.registry._check_session()
        try:
            response = self.registry.session.delete(
                self._rest(f"experiments/{link_id}/")
            )
            response.raise_for_status()
        except Exception as e:
            raise RegistryError(f"Failed to remove experiment link {link_id}") from e

    def set_permission(self, user_id, permission="READ_ENTRY"):
        self.registry._check_session()
        try:
            response = self.registry.session.post(
                self._rest("permissions"),
                json={
                    "article": "ACCOUNT",
                    "articleId": user_id,
                    "type": permission,
                    "typeId": self.db_id,
                },
            )
            response.raise_for_status()
        except Exception as e:
            raise RegistryError(f"Could not set permission on {self}") from e

    def _rest(self, path):
        return self.registry._rest(f"parts/{self.db_id}/{path}")


class Folder:
    def __init__(self, registry, payload):
        self.registry = registry
        self.folder_id = payload["id"]
        self.name = payload["folderName"]

    def add_entries(self, entries):
        self.registry._check_session()
        try:
            response = self.registry.session.put(
                self.registry._rest("folders/entries"),
                json={
                    "all": False,
                    "destination": [{"id": self.folder_id}],
                    "entries": [entry.db_id for entry in entries],
                },
            )
            response.raise_for_status()
        except Exception as e:
            raise RegistryError("Could not add Entries to Folder") from e

    def list_entries(self, **extra):
        self.registry._check_session()
        try:
            response = self.registry.session.get(
                self.registry._rest(f"folders/{self.folder_id}/entries"),
                params=extra,
            )
            response.raise_for_status()
            return [Entry(self.registry, item) for item in response.json()["entries"]]
        except Exception as e:
            raise RegistryError("Could not list Folder Entries") from e


class RegistryValidator:
    """
    Validator for Strain objects tied to ICE registry. If using outside the
    context of Form validation (e.g. in a Celery task), ensure that the Update
    object is created before the callable is called.

    See: https://docs.djangoproject.com/en/dev/ref/validators/
    """

    def __init__(self, existing_strain=None, existing_entry=None):
        """
        If an already-existing Strain object in the database is being updated,
        initialize RegistryValidator with existing_strain. If an entry has
        already been queried from ICE, initialize with existing_entry.
        """
        self.existing_strain = existing_strain
        self.existing_entry = existing_entry

    def load_part_from_ice(self, registry_id):
        if self.existing_entry is not None:
            return self.existing_entry
        # using the Update to get the correct user for the search
        update = models.Update.load_update()
        registry = StrainRegistry()
        user_email = update.mod_by.email
        try:
            with registry.login(update.mod_by):
                return registry.get_entry(registry_id)
        except Exception as e:
            raise ValidationError(
                _("Failed to load strain %(uuid)s from ICE for user %(user)s"),
                code="ice failure",
                params={"user": user_email, "uuid": registry_id},
            ) from e

    def save_strain(self, entry):
        try:
            if entry and self.existing_strain:
                self.existing_strain.name = entry.name
                self.existing_strain.registry_id = entry.registry_id
                self.existing_strain.registry_url = entry.registry_url
                self.existing_strain.save()
            elif entry:
                # not using get_or_create, so exception is raised if registry_id exists
                models.Strain.objects.create(
                    name=entry.name,
                    registry_id=entry.registry_id,
                    registry_url=entry.registry_url,
                )
        except Exception as e:
            raise ValidationError(
                _("Failed to save strain from %(entry)s"),
                code="db failure",
                params={"entry": entry},
            ) from e

    def validate(self, value):
        try:
            # handle multi-valued inputs by validating each value individually
            if isinstance(value, (list, tuple)):
                for v in value:
                    self.validate(v)
                return
            qs = models.Strain.objects.filter(registry_id=value)
            if self.existing_strain:
                qs = qs.exclude(pk__in=[self.existing_strain])
            count = qs.count()
            if count == 0:
                self.save_strain(self.load_part_from_ice(value))
            elif count > 1:
                raise ValidationError(
                    _(
                        "Selected ICE record is already linked to EDD strains: %(strains)s"
                    ),
                    code="existing records",
                    params={"strains": list(qs)},
                )
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(
                _("Error querying for an EDD strain with registry_id %(uuid)s"),
                code="query failure",
                params={"uuid": value},
            ) from e

    def __call__(self, value):
        self.validate(value)


__all__ = [
    AdminRegistry,
    Entry,
    Folder,
    RegistryError,
    RegistryValidator,
    StrainRegistry,
]
