import logging
from datetime import datetime
from itertools import islice

import requests
from django.conf import settings as django_settings
from django.contrib import auth
from django.db.models import Count, F, Prefetch
from django_auth_ldap.backend import _LDAPUser

from edd import utilities
from main import models

logger = logging.getLogger(__name__)
# tuple for request connection and read timeouts, respectively, in seconds
timeout = (10, 10)


class SolrException(IOError):
    pass


class SolrSearch:
    """
    Base class for interfacing with Solr indices.

    Solr concepts to understand:
     - ConfigSet is the schema and configuration of searchers
     - Collection is a grouping of documents to search using a ConfigSet
     - Alias is a name used to reference a Collection
     - Core is an instance of Solr serving documents

    This class was originally written to use Cores directly. It is now using
    Collections, which contain one or more Cores using a ConfigSet. It takes
    the name of a ConfigSet, generates a Collection (and Cores) using that
    ConfigSet, and sets an Alias with the same name as the ConfigSet to point
    to the Collection.

    :param core: the name of the ConfigSet defining the search
    :param settings: (optional) settings dictionary containing the Solr URL
    :param settings_key: (optional) key used to lookup settings dictionary
        from Django setting EDD_MAIN_SOLR (default "default")
    :param url: (optional) directly set Solr URL
    """

    DEFAULT_URL = "http://localhost:8080"

    @classmethod
    def resolve_url(cls, settings, settings_key, url):
        if url is not None:
            return url
        if settings is not None:
            url = settings.get("URL", None)
            if url is not None:
                return url
        SOLR = getattr(django_settings, "EDD_MAIN_SOLR", {})
        if settings_key in SOLR:
            url = SOLR[settings_key].get("URL", None)
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
        self.collection = None
        self.base_url = self.resolve_url(settings, settings_key, url)
        # chop trailing slash if present
        self.base_url = self.base_url.rstrip("/")

    def __repr__(self, *args, **kwargs):
        return self.__str__()

    def __str__(self, *args, **kwargs):
        return f"SolrSearch[{self.url}]"

    def __len__(self):
        queryopt = self.get_queryopt("*:*", size=0)
        result = self.search(queryopt)
        return result.get("response", {}).get("numFound")

    def check(self):
        """Ensures that the ConfigSet for this searcher has a Collection."""
        # find the primary collection, creating one if it does not exist
        primary = self._find_alias_collection()
        if primary is None:
            primary = self.create_collection()
            self.commit_collection()
        return primary

    def clean(self):
        """
        Ensures that the ConfigSet for this searcher has only one Collection.

        This should be used carefully, and only run with guarantees of no other
        potential callers (e.g. during startup).
        """
        # find the primary collection, creating one if it does not exist
        primary = self.check()
        # discard all collections that are not the primary
        discarded = [
            self.discard_collection(collection=name)
            for name in self._find_collections()
            if name != primary
        ]
        # return all the collection names discarded
        return discarded

    def _find_alias_collection(self):
        url = f"{self.base_url}/admin/collections"
        params = {"action": "LISTALIASES"}
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            aliases = response.json()["aliases"]
            return aliases.get(self.core, None)
        except Exception as e:
            raise SolrException(
                f"Failed to find collection for alias {self.core}"
            ) from e

    def _find_collections(self):
        url = f"{self.base_url}/admin/collections"
        params = {"action": "LIST"}
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            collections = response.json()["collections"]
            return [name for name in collections if self.core in name]
        except Exception as e:
            raise SolrException(
                f"Failed to find collections matching {self.core}"
            ) from e

    def collection_name(self):
        now_int = int(datetime.utcnow().timestamp())
        # 5 bytes is big enough for the maximum handled by datetime
        now_hex = now_int.to_bytes(5, "big").hex()
        return f"{self.core}_{now_hex}"

    def create_collection(self):
        """Creates a new collection for searching."""
        url = f"{self.base_url}/admin/collections"
        name = self.collection_name()
        params = {
            "action": "CREATE",
            "collection.configName": self.core,
            "name": name,
            "numShards": 1,
        }
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            self.collection = name
            return self.collection
        except Exception as e:
            raise SolrException(f"Failed to create collection for {self.core}") from e

    def commit_collection(self):
        """Sets a collection name to point the core name alias toward."""
        if self.collection is None:
            raise SolrException("Must call create_collection before commit_collection")
        url = f"{self.base_url}/admin/collections"
        params = {
            "action": "CREATEALIAS",
            "collections": self.collection,
            "name": self.core,
        }
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            self.collection = None
        except Exception as e:
            raise SolrException(
                f"Failed to commit {self.collection} to {self.core}"
            ) from e

    def discard_collection(self, collection=None):
        """Discards a collection from search."""
        collection = filter(None, (collection, self.collection))
        # always reset the collection attribute
        self.collection = None
        if collection is None:
            raise SolrException("No collection to discard")
        url = f"{self.base_url}/admin/collections"
        params = {"action": "DELETE", "name": collection}
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            return collection
        except Exception as e:
            raise SolrException(
                f"Failed to discard collection {self.collection}"
            ) from e

    def reindex(self):
        """Runs a full index for the search collection."""
        self.create_collection()
        try:
            queryset = self.get_queryset()
            self.update(queryset)
            self.commit_collection()
        except Exception as e:
            self.discard_collection()
            raise SolrException(f"Failed to reindex {self.core}") from e

    def get_queryset(self):
        """
        Return an iterable of items that will be sent to the search index.
        In most cases, this will be a Django QuerySet.
        """
        return []  # pragma: no cover

    def get_solr_payload(self, obj):
        if callable(getattr(obj, "to_solr_json", None)):
            return obj.to_solr_json()
        return obj

    def get_queryopt(self, query, **kwargs):
        # do some basic bounds sanity checking
        try:
            start = int(kwargs.get("i", 0))
            start = 0 if start < 0 else start
        except Exception:
            start = 0

        try:
            rows = int(kwargs.get("size", 50))
            rows = 50 if rows < 0 else rows
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

    @property
    def url(self):
        if self.collection is not None:
            return f"{self.base_url}/{self.collection}"
        return f"{self.base_url}/{self.core}"


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

    def get_queryset(self):
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
        results = super().query(query=query, **options)
        # Inject total Study count for datatables
        results["response"]["numTotal"] = models.Study.objects.count()
        return results

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
        if kwargs.get("showMine", False) and self.ident:
            fq.append(f"creator:{self.ident.pk}")
        queryopt["fq"] = fq
        return queryopt


class StudyAdminSearch(StudySearch):
    """StudySearch that acts as an admin user without explictly passing one."""

    def build_acl_filter(self):
        return ("", "id:*")


class UserSearch(SolrSearch):
    """API to manage searching for users via Solr index"""

    def __init__(self, core="users", *args, **kwargs):
        super().__init__(core=core, *args, **kwargs)

    def get_queryset(self):
        User = auth.get_user_model()
        queryset = User.objects.select_related("userprofile").prefetch_related(
            "userprofile__institutions"
        )
        # load any LDAP backends
        backends = [b for b in auth.get_backends() if hasattr(b, "ldap")]
        # attempt to load groups from LDAP before yielding
        for user in queryset:
            for backend in backends:
                # doing this saves a database query over directly loading
                ldap_user = _LDAPUser(backend, user=user)
                try:
                    ldap_user._mirror_groups()
                except Exception:
                    # do nothing on failure to find user in backend
                    pass
            yield user

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
    """API to manage searching for measurement types via Solr index"""

    def __init__(self, core="measurement", *args, **kwargs):
        super().__init__(core=core, *args, **kwargs)

    def get_queryset(self):
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
            if isinstance(family, str):
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
