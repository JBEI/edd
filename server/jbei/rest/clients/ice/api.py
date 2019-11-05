"""
Defines classes and utility methods used to communicate with the Index of Composable Elements
(ICE), a.k.a. the "registry of parts". This API is designed to minimize dependencies on other
libraries (e.g. Django model objects) so that it can be used from any part of the EDD codebase,
including remotely-executed code, with a minimum of network traffic and install process. For
example, many of the methods in the IceApi class are called from Celery tasks that may execute on
a physically separate server from EDD itself, where Django model objects shouldn't be passed over
the network.
"""

import itertools
import json
import logging
import re

import requests
from django.conf import settings
from requests.compat import urlparse

from jbei.rest.api import RestApiClient
from jbei.rest.sessions import Session

logger = logging.getLogger(__name__)


# try to grab values from settings loaded above; use sane defaults
# request and read timeout, respectively, in seconds
ICE_REQUEST_TIMEOUT = getattr(settings, "ICE_REQUEST_TIMEOUT", (10, 10))
ICE_URL = getattr(settings, "ICE_URL", "https://registry.jbei.org")
ICE_SECRET_KEY = getattr(settings, "ICE_SECRET_KEY", None)


class IceApiException(Exception):
    def __init__(self, message="", code=requests.codes.internal_server_error):
        super().__init__(message)
        self.code = code


class IceObject:
    """Base class for JSON data from ICE mapped into Python objects."""

    def __init__(self, **kwargs):
        # just map all the arguments onto self
        self.__dict__.update(**kwargs)


class Entry(IceObject):
    """The Python representation of an ICE entry."""

    KEYWORD_CHANGES = {
        "accessPermissions": "access_permissions",
        "basePairCount": "bp_count",
        "bioSafetyLevel": "biosafety_level",
        "canEdit": "can_edit",
        "creationTime": "creation_time",
        "creatorEmail": "creator_email",
        "creatorId": "creator_id",
        "featureCount": "feature_count",
        "fundingSource": "funding_source",
        "hasAttachment": "has_attachment",
        "hasOriginalSequence": "has_original_sequence",
        "hasSample": "has_sample",
        "hasSequence": "has_sequence",
        "intellectualProperty": "intellectual_property",
        "longDescription": "long_description",
        "modificationTime": "mod_time",
        "ownerEmail": "owner_email",
        "ownerId": "owner_id",
        "partId": "part_id",
        "principalInvestigator": "pi_name",
        "principalInvestigatorEmail": "pi_email",
        "principalInvestigatorId": "pi_id",
        "publicRead": "public_read",
        "recordId": "uuid",
        "selectionMarkers": "selection_markers",
        "shortDescription": "short_description",
        "viewCount": "view_count",
    }
    JSON_TYPE = "PART"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # these things should be lists if not included in inputs
        list_types = (
            "access_permissions",
            "keywords",
            "linked_parts",
            "links",
            "parents",
        )
        for t in list_types:
            if getattr(self, t, None) is None:
                setattr(self, t, [])

    @staticmethod
    def of(json_dict, silence_warnings=False):
        """
        Factory method for creating a Part from a JSON dictionary received from ICE.

        :param json_dict: a dictionary representation of the ICE JSON for this part
        :return: an object representing the part, or None if there's none in the input
        """
        if not json_dict:
            return None

        # build up a list of keyword arguments to use in constructing the Entry.
        python_params = {}

        # linked parts
        linked_parts = [Entry.of(part) for part in json_dict.get("linkedParts", [])]
        python_params["linked_parts"] = linked_parts

        # parents
        parents = [Entry.of(parent) for parent in json_dict.get("parents", [])]
        python_params["parents"] = parents

        # set/replace object parameters in the dictionary
        already_converted = {"linkedParts", "parents"}
        # set objects that have a trivial conversion from JSON to Python,
        # changing the style to match Python's snake_case from the ICE's Java-based camelCase
        for json_keyword, json_value in json_dict.items():
            # skip data that translate to custom Python objects rather than builtin data types
            if json_keyword in already_converted:
                continue

            # TODO: investigate JSON data in this dictionary that we don't
            # currently understand / support.
            if json_keyword in ["parameters"]:
                continue

            python_keyword = Entry.KEYWORD_CHANGES.get(json_keyword, json_keyword)
            python_params[python_keyword] = json_value

        # Note: don't shadow Python builtin 'type'!
        part_type = python_params.pop("type", None)
        return _construct_part(python_params, part_type, silence_warnings)

    def __str__(self):
        return f'{self.part_id} / "{self.name}" / ({self.uuid})'

    def to_json_dict(self):
        # copy all data members into a dictionary
        json_dict = self.__dict__.copy()

        # reverse the json -> python keyword changes performed during deserialization
        for json_keyword, python_keyword in Entry.KEYWORD_CHANGES.items():
            value = json_dict.pop(python_keyword, None)
            if value:
                json_dict[json_keyword] = value

        return json_dict


def _construct_part(python_params, part_type, silence_warnings):
    # extract strain-specific data, if available. change camel case to snake case.
    type_to_class_and_keyword = {
        "PLASMID": (Plasmid, "plasmidData"),
        "STRAIN": (Strain, "strainData"),
        "ARABADOPSIS": (Arabidopsis, "Arabidopsis"),
        "PROTEIN": (Protein, "proteinData"),
        "PART": (Entry, None),
    }
    try:
        part_class, keyword = type_to_class_and_keyword.get(part_type)
    except Exception as e:
        raise IceApiException(f"Unsupported type {part_type}") from e
    class_data = python_params.pop(keyword, None)
    if keyword is None:
        # no special handling
        pass
    elif class_data:
        python_params.update(
            {
                part_class.KEYWORD_CHANGES.get(keyword, keyword): value
                for keyword, value in class_data.items()
            }
        )
    elif not silence_warnings:
        logger.warning(
            "JSON for {class_name} '{part_id}' has type={type}, "
            "but no {field_name} field.".format(
                class_name=part_class.__name__,
                part_id=python_params.get("part_id", "no-part-id"),
                type=part_type,
                field_name=keyword,
            )
        )
    return part_class(**python_params)


class Strain(Entry):
    KEYWORD_CHANGES = {"genotypePhenotype": "genotype_phenotype"}
    JSON_TYPE = "STRAIN"

    def to_json_dict(self):
        json_dict = super().to_json_dict()

        # remove strain-specific data from the dictionary and re-package it as in ICE's JSON
        host_value = json_dict.pop("host", None)
        geno_value = json_dict.pop("genotype_phenotype", None)

        strain_data = {}
        if host_value:
            strain_data["host"] = host_value
        if geno_value:
            strain_data["genotypePhenotype"] = geno_value
        if strain_data:
            json_dict["strainData"] = strain_data

        return json_dict


class Folder(IceObject):
    # build a dict of keywords for translating field names from Java-based conventions used in
    # ICE's JSON to Python style names
    keyword_changes_dict = {
        "folderName": "name",
        "count": "entry_count",
        "propagatePermission": "propagate_permission",
        "canEdit": "can_edit",
        "creationTime": "creation_time",
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # convert entries to Entry objects
        self.entries = [Entry.of(entry) for entry in self.entries or []]

    @staticmethod
    def of(json_dict):
        python_object_params = {}
        for json_key, value in json_dict.items():
            python_keyword = Folder.keyword_changes_dict.get(json_key, json_key)
            python_object_params[python_keyword] = value
        return Folder(**python_object_params)

    def to_json_dict(self):
        json_dict = {
            java: getattr(self, python)
            for java, python in self.keyword_changes_dict.items()
        }
        json_dict["id"] = self.id
        json_dict["entries"] = [entry.to_json_dict() for entry in self.entries]
        return json_dict


# Design note: all part-specific params are currently optional so that we can still at least
# capture the part type when the part gets returned from a search without any of its type-specific
# data. TODO: confirm with Hector P. that this is intentional, then make them non-optional if
# needed
class Plasmid(Entry):
    KEYWORD_CHANGES = {
        "originOfReplication": "origin_of_replication",
        "replicatesIn": "replicates_in",
    }
    JSON_TYPE = "PLASMID"


class Protein(Entry):
    KEYWORD_CHANGES = {"geneName": "gene_name"}
    JSON_TYPE = "PROTEIN"


class Arabidopsis(Entry):
    KEYWORD_CHANGES = {
        "harvestDate": "harvest_date",
        "seedParents": "seed_parents",
        "plantType": "plant_type",
        "sentToAbrc": "sent_to_a_brc",
    }
    JSON_TYPE = "ARABIDOPSIS"


class IceApi(RestApiClient):
    """
    Defines the interface to ICE's REST API.

    TODO: extremely basic interface to ICE API; should eventually expand to cover more
    of the API, modularize (i.e. so others can just import jbei.ice), and document.
    """

    # Flag enabling data changes via this RestApiClient instance. When False, any attempts
    # to change data will result in an Exception. Data changes are disabled by default to
    # prevent accidental data loss or corruption.
    write_enabled = False

    local_folder_pattern = re.compile(r"^/folders/(\d+)/?$")
    web_folder_pattern = re.compile(r"^/partners/(\d+)/folders/(\d+)/?$")

    def __init__(self, auth, base_url=ICE_URL, result_limit=15, verify_ssl_cert=True):
        """
        Creates a new instance of IceApi

        :param auth: the authentication strategy for communication with ICE
        :param session: object implementing the Requests API; defaults to Session
        :param base_url: the base URL of the ICE install.
        :param result_limit: the maximum number of results that can be returned from a single
            query. The default is ICE's default limit at the time of writing. Note that ICE
            doesn't return paging-related data from its REST API, so to provide consistent
            tracking of how results are paged, some value has to be provided.
        """
        if not auth:
            raise ValueError("A valid authentication mechanism must be provided")
        session = Session(auth=auth, verify_ssl_cert=verify_ssl_cert)
        super().__init__(base_url, session, result_limit)

    def _prevent_write_while_disabled(self):
        """
        Throws a RuntimeException if self._enable_write is false. This is part of a
        belt-AND-suspenders check for preventing data loss, especially if this code eventually
        makes its way into the hands of researchers inexperienced in programming. It's already
        prevented at least one accidental data change during EDD script development!
        """
        if not self.write_enabled:
            raise IceApiException(
                "To prevent accidental data loss or corruption, data changes "
                "to ICE are disabled. Use write_enabled to allow writes, but "
                "please use carefully!"
            )

    def get_entry(self, entry_id, suppress_errors=False):
        """
        Retrieves an ICE entry using any of the unique identifiers: UUID (preferred), part
        number (often globally unique, though not enforceably), or locally-unique primary
        key. Returns a Part object, or None if no part was found, or if there were
        suppressed errors in making the request. Note that this method doesn't currently
        support querying the web of registries for entries that aren't stored locally in this ICE
        instance.

        :param entry_id: the ICE ID for this entry (either the UUID, part number,
            locally-unique integer primary key)
        :param suppress_errors: true to catch and log exception messages and return
            None instead of raising Exceptions.
        :return: A Part object representing the response from ICE, or None if an
            Exception occurred but suppress_errors was true.
        """
        rest_url = f"{self.base_url}/rest/parts/{entry_id}"
        try:
            response = self.session.get(url=rest_url)
            response.raise_for_status()
            json_dict = json.loads(response.text)
            if json_dict:
                entry = Entry.of(json_dict, False)
                entry.url = f"{self.base_url}/entry/{entry.id}"
                return entry
        except requests.exceptions.Timeout as e:
            if not suppress_errors:
                raise IceApiException() from e
            logger.exception("Timeout requesting part %s: %s", entry_id)
        except requests.exceptions.HTTPError as e:
            if response.status_code == requests.codes.not_found:
                return None
            elif not suppress_errors:
                raise IceApiException() from e
            logger.exception(
                "Error fetching part from ICE with entry_id %(entry_id)s. "
                'Response = %(status_code)d: "%(msg)s"'
                % {
                    "entry_id": entry_id,
                    "status_code": response.status_code,
                    "msg": response.reason,
                }
            )
        return None

    def get_folder(self, folder_id, partner_id=None):
        """
        Retrieves an ICE folder using its unique identifier.

        :param id: the ICE ID for this entry (either the UUID, part number,
            locally-unique integer primary  key)
        :return: A Folder object representing the response from ICE
        """
        params = {}

        base_url = self.base_url
        if not partner_id:
            rest_url = f"{base_url}/rest/folders/{folder_id}"
        else:
            # TODO: this is the observed pattern from the ICE UI, but maybe a more standard,
            # URL-only scheme is also supported?
            rest_url = f"{base_url}/rest/partners/{partner_id}/folders"
            params["folderId"] = folder_id

        try:
            response = self.session.get(url=rest_url)
            if response.status_code == requests.codes.not_found:
                return None
            response.raise_for_status()
            json_dict = json.loads(response.text)
            return Folder.of(json_dict)
        except Exception as e:
            raise IceApiException(f"Failed loading folder {folder_id}") from e

    def _init_folder_entries_params(self, folder_id, partner_id=None, sort=None):
        params = {}
        if not partner_id:
            rest_url = f"{self.base_url}/rest/folders/{folder_id}/entries"
        else:
            rest_url = f"{self.base_url}/rest/partners/{partner_id}/folders/entries"
            params["folderId"] = folder_id
        if sort:
            descending = sort.startswith("-")
            params["sort"] = sort[1:] if descending else sort
            # cast to lower case for Java ICE
            params["asc"] = str(not descending).lower()
        params["limit"] = self.result_limit
        return rest_url, params

    def get_folder_entries(self, folder_id, partner_id=None, sort=None):
        """
        Retrieves an ICE folder using its unique identifier, with Entry objects included.

        :param id: the ICE ID for this folder
        :return: A Part object representing the response from ICE
        """
        rest_url, params = self._init_folder_entries_params(folder_id, partner_id, sort)

        def fetch_entries(initial):
            for entry in initial:
                yield entry
            offsets = itertools.count(start=self.result_limit, step=self.result_limit)
            for offset in offsets:
                params["offset"] = offset
                response = self.session.get(url=rest_url, params=params)
                response.raise_for_status()
                page = Folder.of(response.json())
                if len(page.entries) == 0:
                    break
                for entry in page.entries:
                    yield entry

        try:
            response = self.session.get(url=rest_url, params=params)
            if response.status_code == requests.codes.not_found:
                return None
            response.raise_for_status()
            folder = Folder.of(response.json())
            # replace entries with a generator that fetches remaining pages on-demand
            folder.entries = fetch_entries(folder.entries)
            return folder
        except Exception as e:
            raise IceApiException(f"Failed loading folder entries {folder_id}") from e

    def folder_from_url(self, url):
        try:
            url_parts = self._check_matching_base_url(url)
            folder_id, partner_id = self._extract_folder_id(url_parts.path)
            return self.get_folder(folder_id, partner_id)
        except IceApiException:
            raise
        except Exception as e:
            raise IceApiException(f"Failed to load ICE Folder at {url}") from e

    def _check_matching_base_url(self, url):
        url_parts = urlparse(str(url).lower().strip())
        if not (url_parts.netloc and url_parts.path):
            raise IceApiException(
                "URL does not match the expected format.",
                code=requests.codes.bad_request,
            )
        my_url_parts = urlparse(self.base_url)
        if url_parts.netloc != my_url_parts.netloc:
            raise IceApiException(
                "URL is in the wrong ICE instance.", code=requests.codes.bad_request
            )
        return url_parts

    def _extract_folder_id(self, path):
        match = self.local_folder_pattern.match(path)
        folder_id = None
        partner_id = None
        if match:
            folder_id = match.group(1)
        else:
            match = self.web_folder_pattern.match(path)
            if match:
                partner_id = match.group(1)
                folder_id = match.group(2)
        if folder_id is None:
            raise IceApiException(
                f"Unable to process the URL; must be of the form `{self.base_url}/folders/123`",
                code=requests.codes.bad_request,
            )
        elif partner_id is not None:
            raise IceApiException(
                "Folders from Web of Registries are not yet supported.",
                code=requests.codes.bad_request,
            )
        return folder_id, partner_id

    def search(self, search_terms):
        """
        Simple ICE search. Give a search term, get a list of entry dicts.
        """
        logger.info(f'Searching for ICE entries using search terms "{search_terms}"')
        url = f"{self.base_url}/rest/search"
        try:
            query_json = json.dumps({"queryString": search_terms})
            response = self.session.post(
                url,
                data=query_json,
                headers={"Content-Type": "application/json; charset=utf8"},
            )
            response.raise_for_status()
            results = response.json()
            return [record["entryInfo"] for record in results["results"]]
        except Exception as e:
            raise IceApiException(
                f"Could not complete search for {search_terms}"
            ) from e

    def unlink_entry_from_study(self, ice_entry_id, study_url):
        """
        Contacts ICE to find and remove all the links from the specified ICE part to the
        specified EDD study. In practical use, there will probably only ever be one per
        part/study combination.

        :param ice_entry_id: the id of the ICE entry whose link to the study
            should be removed (either a UUID or the numeric id)
        :param study_url: the study URL
        :raises RequestException: for any issues making requests to ICE REST API
        """
        for link in self.fetch_experiment_links(ice_entry_id):
            if link.get("url", None) == study_url:
                link_id = link.get("id")
                logger.info(f"Deleting link {link_id} from entry {ice_entry_id}")
                self.remove_experiment_link(ice_entry_id, link_id)
                return
        logger.warning(f"No link found for {study_url} in entry {ice_entry_id}")

    def fetch_experiment_links(self, ice_entry_id):
        try:
            response = self.session.get(
                f"{self.base_url}/rest/parts/{ice_entry_id}/experiments/"
            )
            response.raise_for_status()
            for link in response.json():
                yield link
        except Exception as e:
            raise IceApiException(
                f"Failed to load experiment links from {ice_entry_id}"
            ) from e

    def add_experiment_link(self, ice_entry_id, study_name, study_url):
        """Communicates with ICE to link an ICE entry to an EDD study"""
        self._prevent_write_while_disabled()
        payload = {"label": study_name, "url": study_url}
        try:
            response = self.session.post(
                f"{self.base_url}/rest/parts/{ice_entry_id}/experiments/",
                data=json.dumps(payload),
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
        except Exception as e:
            raise IceApiException(
                f"Failed to add experiment link {study_url} to {ice_entry_id}"
            ) from e

    def remove_experiment_link(self, ice_entry_id, link_id):
        """Removes the specified experiment link from an ICE entry"""
        self._prevent_write_while_disabled()
        try:
            response = self.session.delete(
                f"{self.base_url}/rest/parts/{ice_entry_id}/experiments/{link_id}/"
            )
            response.raise_for_status()
        except Exception as e:
            raise IceApiException(
                f"Failed to remove experiment link {link_id} from {ice_entry_id}"
            ) from e
