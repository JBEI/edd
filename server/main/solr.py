import logging
from itertools import islice

import requests
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.db.models import Count, F, Prefetch
from six import string_types

from edd import utilities

from . import models

logger = logging.getLogger(__name__)
# tuple for request connection and read timeouts, respectively, in seconds
timeout = (10, 10)


class SolrException(IOError):
    pass


class SolrSearch:
    """ Base class for interfacing with Solr indices. """

    DEFAULT_URL = "http://localhost:8080"

    @classmethod
    def resolve_url(cls, settings, settings_key, url):
        if url is not None:
            return url
        if settings is not None:
            url = settings.get("URL", None)
            if url is not None:
                return url
        if settings_key in django_settings.EDD_MAIN_SOLR:
            url = django_settings.EDD_MAIN_SOLR[settings_key].get("URL", None)
            if url is not None:
                return url
        logger.warning("Could not resolve a URL for Solr, falling back to default")
        return cls.DEFAULT_URL

    def __init__(
        self,
        core=None,
        settings=None,
        settings_key="default",
        url=None,
        *args,
        **kwargs,
    ):
        self.core = core
        self.base_url = self.resolve_url(settings, settings_key, url)
        # chop trailing slash if present
        self.base_url = self.base_url.rstrip("/")

    def __repr__(self, *args, **kwargs):
        return self.__str__()

    def __str__(self, *args, **kwargs):
        return f"SolrSearch[{self.url}]"

    def clear(self):
        """
        Clears the index, deleting everything.

        :raises SolrException: if an error occurs during the attempt
        """
        # build the request
        url = f"{self.url}/update/json"
        command = r'{"delete":{"query":"*:*"},"commit":{}}'
        headers = {"content-type": "application/json"}
        try:
            # issue the request (raises IOError)
            response = requests.post(
                url, data=command, headers=headers, timeout=timeout
            )
            # raises HttpError (extends IOError)
            response.raise_for_status()
        except Exception as e:
            raise SolrException(f"Failed to clear index {self}") from e
        return self

    def get_solr_payload(self, obj):
        return obj.to_solr_json()

    def get_queryopt(self, query, **kwargs):
        # do some basic bounds sanity checking
        try:
            start = int(kwargs.get("i", 0))
            start = 0 if start < 0 else start
        except Exception:
            start = 0

        try:
            rows = int(kwargs.get("size", 50))
            rows = 50 if rows < 1 else rows
        except Exception:
            rows = 50
        queryopt = {
            "indent": True,
            "q": query,
            "start": start,
            "rows": rows,
            "sort": kwargs.get("sort", None),
            "wt": "json",
            "fl": "*",
        }
        return queryopt

    def remove(self, docs):
        """
        Updates Solr with a list of objects to remove from the index.

        :param docs: an iterable of objects with an id property

        :raises SolrException: if an error occurs during the removal attempt. Note that
            removals are performed iteratively, so it's possible that some succeeded
            before the error occurred.
        """
        logger.info(f"Removing items from {self}")
        # Does no permissions checking; permissions already valid if called from
        # Study pre_delete signal, but other clients must do their own permission checks.
        url = f"{self.url}/update/json"
        headers = {"content-type": "application/json"}
        commands = ",".join(f'"delete":{{"id":"{doc.id}"}}' for doc in docs)
        try:
            response = requests.post(
                url,
                data=f'{{{commands}, "commit":{{}}}}',
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
        # catch / re-raise communication errors after logging some helpful
        # context re: where the error occurred
        except Exception as e:
            raise SolrException(f"Failed to remove from index {docs}") from e

    def search(self, queryopt=None):
        """
        Runs query with raw Solr parameters

        :return: a dictionary containing the Solr json response
        :raises SolrException: if an error occurs during the query attempt
        """
        if queryopt is None:
            queryopt = {"q": "*:*", "wt": "json"}
        # single character queries will never return results as smallest ngram is 2 characters
        if len(queryopt["q"]) == 1:
            queryopt["q"] = f'{queryopt["q"]}*'
        logger.debug(f"{self} searching with: {queryopt}")
        try:
            # contact Solr / raise any IOErrors that arise
            response = requests.get(
                f"{self.url}/select", params=queryopt, timeout=timeout
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise SolrException(f"{self} failed search with {queryopt}") from e

    def query(self, query, **kwargs):
        """
        Runs a query against the Solr core, translating options to the Solr syntax.

        Arguments:
            query: Solr query string (default: 'is_active:true')
            i: starting index of results to fetch (default: 0)
            size: maximum fetch size (default: 50)
            sort: comma-delimited string of "field (asc|desc)" (default: None)
        Returns:
            JSON results of query:
                - responseHeader
                    - status: 0 for no errors, otherwise an error code
                    - QTime: milliseconds to complete query
                    - params: echo of parameters used in request
                - response
                    - numFound: total documents matching query
                    - start: starting index of results
                    - docs: array of results
        :raises SolrException: if an error occurs during the query attempt
            (error connecting, or HTTP error response from Solr)
        """
        queryopt = self.get_queryopt(query, **kwargs)
        return self.search(queryopt=queryopt)

    def update(self, docs):
        """
        Update Solr index from the given list of objects. Does no permissions checking;
        permissions already valid if called from Study post_save signal, but other
        clients must do own checks on permissions.

        :param docs: an iterable of objects with a to_solr_json method to update in Solr.
            Must have an id attribute.
        :raises SolrException: if an error occurs during the update attempt
        """
        logger.info(f"Sending updates to {self}")
        url = f"{self.url}/update/json"
        headers = {"content-type": "application/json"}
        payload = filter(lambda d: d is not None, map(self.get_solr_payload, docs))
        try:
            # Send updates in groups of 50
            for group in iter(lambda: list(islice(payload, 50)), []):
                ids = [item.get("id") for item in group]
                logger.debug(f"{self} updating with IDs: {ids}")
                # make an initial request to do the add / raise IOError if it occurs
                response = requests.post(
                    url,
                    data=utilities.JSONEncoder.dumps(group),
                    headers=headers,
                    timeout=timeout,
                )
                response.raise_for_status()
            # if the adds worked, send commit command
            response = requests.post(
                url, data=r'{"commit":{}}', headers=headers, timeout=timeout
            )
            # raises HttpError (extends IOError)
            response.raise_for_status()
        except Exception as e:
            raise SolrException(f"{self} failed update") from e

    def swap(self):
        """
        Change this search object to point to the swap index. All other search
        objects will continue to use the main index.
        """
        if self.core.endswith("_swap"):
            self.core = self.core[: self.core.rfind("_swap")]
        else:
            self.core = self.core + "_swap"
        return self

    def swap_execute(self):
        """
        Change this search object AND ALL OTHERS to point to the swap index.
        Use this to handle long-running re-index tasks; update everything in
        the swap index, then replace the main index with the swap index.
        """
        url = f"{self.base_url}/admin/cores"
        current_core = self.core
        updated_core = self.swap().core
        params = {"action": "SWAP", "other": updated_core, "core": current_core}
        try:
            # send the request to swap out the current core for the updated one
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            # swap again after the service switches the backing cores
            return self.swap()
        except Exception as e:
            raise SolrException(f"Swap of {self} failed") from e

    @property
    def url(self):
        return f"{self.base_url}/{self.core}"

    def __len__(self):
        url = f"{self.base_url}/admin/cores"
        try:
            response = requests.get(url, params={"core": self.core}, timeout=timeout)
            response.raise_for_status()
            return response.json()["status"][self.core]["index"]["maxDoc"]
        except Exception as e:
            raise SolrException(f"Could not load length of {self}") from e


class StudySearch(SolrSearch):
    """
    A more-or-less straight port of the StudySearch.pm module from the EDD perl code. Makes
    requests to the custom Solr schema created to search EDD studies.

    Arguments:
        ident: User object from django.contrib.auth.models
        url: Base URL for Solr instance (default: None; overrides settings value if not None)
        settings_key: connection key in settings SOLR value
    """

    def __init__(self, core="studies", ident=None, *args, **kwargs):
        super().__init__(core=core, *args, **kwargs)
        self.ident = ident

    def __str__(self, *args, **kwargs):
        return f"StudySearch[{self.url}][{self.ident}]"

    def build_acl_filter(self):
        """
        Create a fq (filter query) string based on an ident (django.contrib.auth.models.User).

        Arguments:
            ident: User object from django.contrib.auth.models
        Returns:
            tuple of (read permission filter, write permission eval)
        """
        if self.ident is None:
            raise SolrException("No user defined for query")
        # Admins get no filter on read, and a query that will always eval true for write
        if self.ident.is_superuser:
            return ("", "id:*")
        user_acl = f'"u:{self.ident.username}"'
        acl = ['"g:__Everyone__"', user_acl] + [
            f'"g:{g.name}"' for g in self.ident.groups.all()
        ]
        return (
            " OR ".join([f"aclr:{r}" for r in acl]),
            " OR ".join([f"aclw:{w}" for w in acl]),
        )

    @staticmethod
    def get_queryset():
        return (
            models.Study.objects.select_related(
                "contact",
                "updated__mod_by__userprofile",
                "created__mod_by__userprofile",
            )
            .annotate(_file_count=Count("files"), _comment_count=Count("comments"))
            .prefetch_related(
                Prefetch(
                    "userpermission_set",
                    queryset=models.UserPermission.objects.select_related("user"),
                ),
                Prefetch(
                    "grouppermission_set",
                    queryset=models.GroupPermission.objects.select_related("group"),
                ),
                "everyonepermission_set",
            )
        )

    def query(self, query="", options=None):
        """
        Run a query against the Solr index.

        Arguments:
            query: Solr query string (default: 'active:true')
            options: dict containing optional query parameters
                - edismax: boolean to run query as term in edismax query (default: False)
                - i: starting index of results to fetch (default: 0)
                - size: maximum fetch size (default: 50)
                - sort: comma-delimited string of "field (asc|desc)" (default: None)
                - showDisabled: boolean adds a filter query for active studies (default: False)
                - showMine: boolean adds a filter query for current user's studies (default:
                    False)
        Returns:
            JSON results of query:
                - responseHeader
                    - status: 0 for no errors, otherwise an error code
                    - QTime: milliseconds to complete query
                    - params: echo of parameters used in request
                - response
                    - numFound: total documents matching query
                    - start: starting index of results
                    - docs: array of results
        :raises IOError: if an error occurs during the query attempt
        """
        # Keeping the old signature to retain backward-compatibility
        if options is None:
            options = {}
        return super().query(query=query, **options)

    def get_queryopt(self, query, **kwargs):
        queryopt = super().get_queryopt(query, **kwargs)
        (readable, writable) = self.build_acl_filter()
        fq = [readable]
        queryopt["fl"] = f"""*,score,writable:exists(query({{!v='{writable}'}},0))"""
        if kwargs.get("edismax", False):
            queryopt["defType"] = "edismax"
            # these are the query fields and boosts to use in EDisMax
            queryopt["qf"] = " ".join(
                [
                    "name^10",
                    "name_ng",
                    "description^5",
                    "description_ng",
                    "contact",
                    "contact_ng",
                    "creator_email",
                    "creator_name",
                    "creator_ng",
                    "initials",
                    "metabolite_name",
                    "protocol_name",
                    "part_name",
                ]
            )
            queryopt["q.alt"] = "*:*"
        if not kwargs.get("showDisabled", False):
            fq.append("active:true")
        if kwargs.get("showMine", False):
            fq.append(f"creator:{self.ident.pk}")
        queryopt["fq"] = fq
        return queryopt


class UserSearch(SolrSearch):
    """ API to manage searching for users via Solr index """

    def __init__(self, core="users", *args, **kwargs):
        super().__init__(core=core, *args, **kwargs)

    @staticmethod
    def get_queryset():
        return (
            get_user_model()
            .objects.select_related("userprofile")
            .prefetch_related("userprofile__institutions")
        )

    def query(self, query="is_active:true", options=None):
        """
        Run a query against the Users Solr index.

        Arguments:
            query: Solr query string (default: 'is_active:true')
            options: dict containing optional query parameters
                - edismax: boolean to run query as term in edismax query (default: False)
                - i: starting index of results to fetch (default: 0)
                - size: maximum fetch size (default: 50)
                - sort: comma-delimited string of "field (asc|desc)" (default: None)
                - showDisabled: boolean adds a filter query for active studies (default: False)
        Returns:
            JSON results of query:
                - responseHeader
                    - status: 0 for no errors, otherwise an error code
                    - QTime: milliseconds to complete query
                    - params: echo of parameters used in request
                - response
                    - numFound: total documents matching query
                    - start: starting index of results
                    - docs: array of results
        :raises IOError: if an error occurs during the query attempt (error connecting,
            or HTTP error response from Solr)
        """
        # Keeping the old signature to retain backward-compatibility
        if options is None:
            options = {}
        return super().query(query=query, **options)

    def get_queryopt(self, query, **kwargs):
        queryopt = super().get_queryopt(query, **kwargs)
        if kwargs.get("edismax", False):
            queryopt["defType"] = "edismax"
            # these are the query fields and boosts to use in EDisMax
            queryopt["qf"] = " ".join(
                [
                    "name^10",
                    "name_ng^5",
                    "initial_lower^5",
                    "group_ng",
                    "institution_ng",
                ]
            )
            queryopt["q.alt"] = "*:*"
        if kwargs.get("showDisabled", False):
            queryopt["fq"] = [queryopt["fq"], "is_active:true"]
        return queryopt


class MeasurementTypeSearch(SolrSearch):
    """ API to manage searching for measurement types via Solr index """

    def __init__(self, core="measurement", *args, **kwargs):
        super().__init__(core=core, *args, **kwargs)

    @staticmethod
    def get_queryset():
        return models.MeasurementType.objects.annotate(
            _source_name=F("type_source__name")
        ).select_related(
            "metabolite", "proteinidentifier", "geneidentifier", "phosphor"
        )

    def get_queryopt(self, query, **kwargs):
        queryopt = super().get_queryopt(query, **kwargs)
        queryopt["defType"] = "edismax"
        queryopt["qf"] = " ".join(
            [
                "name^10",  # put high weight on matching name
                "name_edge^5",  # half as much on matching begin/end of name
                "name_ng^2",  # smaller weight on matching substring
                "synonym^8",  # high weight on matching synonyms
                "synonym_edge^4",  # half as much on matching begin/end of synonym
                "synonym_ng^2",  # smaller weight on matching substring of synonym
                "code^10",  # high weight on matching the BIGG/SBML short name
                "m_formula",  # small weight on matching formula string
            ]
        )
        queryopt["q.alt"] = "*:*"
        if kwargs.get("family", None):
            family = kwargs["family"]
            if isinstance(family, string_types):
                queryopt["fq"] = f"family:{family}"
            else:
                queryopt["fq"] = [f"family:{f}" for f in family].join(" OR ")
        return queryopt

    def get_solr_payload(self, obj):
        Group = models.MeasurementType.Group
        if obj.type_group == Group.METABOLITE:
            item = getattr(obj, "metabolite", obj)
        elif obj.type_group == Group.PROTEINID:
            item = getattr(obj, "proteinidentifier", obj)
        else:
            item = obj
        return item.to_solr_json()
