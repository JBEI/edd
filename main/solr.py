# -*- coding: utf-8 -*-

import json
import logging
import requests

from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.db.models import Count, F, Prefetch
from itertools import islice
from six import string_types

from . import models
from edd import utilities


logger = logging.getLogger(__name__)
timeout = (10, 10)  # tuple for request connection and read timeouts, respectively, in seconds


class SolrSearch(object):
    """ Base class for interfacing with Solr indices. """

    def __init__(self, core=None, settings=None, settings_key='default', url=None,
                 *args, **kwargs):
        self.core = core
        if settings is not None:
            self.settings = settings
        elif settings_key in django_settings.EDD_MAIN_SOLR:
            self.settings = django_settings.EDD_MAIN_SOLR[settings_key]
        else:
            logger.warning('Using default fallback Solr configuration, no setting key for %s'
                           % (settings_key))
            self.settings = {'URL': 'http://localhost:8080/', }
        if url is not None:
            self.settings['URL'] = url
        # ensure the URL has the trailing slash
        if self.settings['URL'][-1] != '/':
            self.settings['URL'] = self.settings['URL'] + '/'

    def __repr__(self, *args, **kwargs):
        return self.__str__()

    def __str__(self, *args, **kwargs):
        return 'SolrSearch[%s]' % self.url

    def clear(self):
        """
        Clears the index, deleting everything.
        :raises IOError if an error occurs during the attempt
        """
        # build the request
        url = self.url + '/update/json'
        command = '{"delete":{"query":"*:*"},"commit":{}}'
        headers = {'content-type': 'application/json'}
        # issue the request (raises IOError)
        response = requests.post(url, data=command, headers=headers, timeout=timeout)
        response.raise_for_status()  # raises HttpError (extends IOError)
        return self

    def get_solr_payload(self, obj):
        return obj.to_solr_json()

    def get_queryopt(self, query, **kwargs):
        # do some basic bounds sanity checking
        try:
            start = int(kwargs.get('i', 0))
            start = 0 if start < 0 else start
        except Exception as e:
            start = 0

        try:
            rows = int(kwargs.get('size', 50))
            rows = 50 if rows < 1 else rows
        except Exception as e:
            rows = 50
        queryopt = {
            'indent': True,
            'q': query,
            'start': start,
            'rows': rows,
            'sort': kwargs.get('sort', None),
            'wt': 'json',
            'fl': '*',
        }
        return queryopt

    def remove(self, docs=[]):
        """
        Updates Solr with a list of objects to remove from the index.

        :param docs: an iterable of objects with an id property

        :raises IOError: if an error occurs during the removal attempt. Note that removals are
            performed iteratively, so it's possible that some succeeded before the error occurred.
        """
        # Does no permissions checking; permissions already valid if called from Study pre_delete
        # signal, but other clients must do their own permission checks.
        url = self.url + '/update/json'
        # proactively log input to help diagnose integration errors, if they occur
        logger.info('%(cls)s deleting from solr index with: %(ids)s' % {
            'cls': self.__class__.__name__,
            'ids': [doc.id for doc in docs],
        })
        command = '{"delete":{"query":"id:%s"},"commit":{}}'
        headers = {'content-type': 'application/json'}
        for doc in docs:
            try:
                response = requests.post(
                    url,
                    data=command % (doc.id,),
                    headers=headers,
                    timeout=timeout,
                )
                response.raise_for_status()
            # catch / re-raise communication errors after logging some helpful context re: where
            # the error occurred
            except IOError as err:
                # log the doc id on which the error occurred, then re-raise the error
                logger.error('Error removing data from Solr index. Failed on doc id %s', doc.id)
                raise err

    def search(self, queryopt={'q': '*:*', 'wt': 'json', }):
        """
            Runs query with raw Solr parameters
            :return: a dictionary containing the Solr json response
            :raises IOError: if an error occurs during the query attempt
         """
        # single character queries will never return results as smallest ngram is 2 characters
        if len(queryopt['q']) == 1:
            queryopt['q'] = queryopt['q'] + '*'

        # proactively log input to help diagnose integration errors, if they occur
        logger.info('%(cls)s searching solr index with: %(queryopt)s' % {
            'cls': self.__class__.__name__,
            'queryopt': queryopt,
        })

        # contact Solr / raise any IOErrors that arise
        response = requests.get(self.url + '/select', params=queryopt, timeout=timeout)
        response.raise_for_status()

        return response.json()

    def query(self, query, **kwargs):
        """ Runs a query against the Solr core, translating options to the Solr syntax.

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
            :raises IOError: if an error occurs during the query attempt (error connecting,
                or HTTP error response from Solr)
        """
        queryopt = self.get_queryopt(query, **kwargs)
        return self.search(queryopt=queryopt)

    def update(self, docs=[]):
        """
        Update Solr index from the given list of objects. Does no permissions checking; permissions
        already valid if called from Study post_save signal, but other clients must do own checks
        on permissions.

        :param docs: an iterable of objects with a to_solr_json method to update in Solr. Must
            have an id attribute.
        :return: list of Solr's JSON response(s), if the update was successfully performed.
        :raises IOError: if an error occurs during the update attempt
        """
        url = self.url + '/update/json'
        payload = filter(lambda d: d is not None, map(self.get_solr_payload, docs))
        response_list = []

        headers = {'content-type': 'application/json'}
        # Send updates in groups of 50
        for group in iter(lambda: list(islice(payload, 50)), []):
            ids = [item.get('id') for item in group]
            logger.info('%(cls)s updating solr index with IDs: %(ids)s' % {
                'cls': self.__class__.__name__,
                'ids': ids,
            })
            # make an initial request to do the add / raise IOError if it occurs
            response = requests.post(
                url,
                data=json.dumps(group, cls=utilities.JSONEncoder),
                headers=headers,
                timeout=timeout,
            )
            # if we received a valid response with an HTTP error code, raise HttpException
            response.raise_for_status()

            # if the add worked, send commit command
            add_json = response.json()
            response = requests.post(
                url,
                data='{"commit":{}}',
                headers=headers,
                timeout=timeout,
            )  # raises IOError
            response.raise_for_status()  # raises HttpError (extends IOError)
            logger.info('%(cls)s commit successful with IDs: %(ids)s' % {
                'cls': self.__class__.__name__,
                'ids': ids,
            })
            response_list.append(add_json)
        return response_list

    def swap(self):
        """
        Change this search object to point to the swap index. All other search objects will
        continue to use the main index.
        """
        if self.core.endswith('_swap'):
            self.core = self.core[:self.core.rfind('_swap')]
        else:
            self.core = self.core + '_swap'
        return self

    def swap_execute(self):
        """
        Change this search object AND ALL OTHERS to point to the swap index. Use this to handle
        long-running re-index tasks; update everything in the swap index, then replace the main
        index with the swap index.
        """
        url = self.settings['URL'] + 'admin/cores'
        params = {
            'action': 'SWAP',
            'other': self.swap().core,
            'core': self.swap().core,
        }
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        return self

    @property
    def url(self):
        return self.settings['URL'] + self.core


class StudySearch(SolrSearch):
    """ A more-or-less straight port of the StudySearch.pm module from the EDD perl code. Makes
        requests to the custom Solr schema created to search EDD studies.

        Arguments:
            ident: User object from django.contrib.auth.models
            url: Base URL for Solr instance (default: None; overrides settings value if not None)
            settings_key: connection key in settings SOLR value
    """

    def __init__(self, core='studies', ident=None, *args, **kwargs):
        super(StudySearch, self).__init__(core=core, *args, **kwargs)
        self.ident = ident

    def __str__(self, *args, **kwargs):
        return 'StudySearch[%s][%s]' % (self.url, self.ident)

    @staticmethod
    def build_acl_filter(ident):
        """ Create a fq (filter query) string based on an ident (django.contrib.auth.models.User).

            Arguments:
                ident: User object from django.contrib.auth.models
            Returns:
                tuple of (read permission filter, write permission eval) """
        # Admins get no filter on read, and a query that will always eval true for write
        if ident.is_superuser:
            return ('', 'id:*')
        user_acl = '"u:%s"' % ident.username
        acl = ['"g:__Everyone__"', user_acl, ] + ['"g:%s"' % g.name for g in ident.groups.all()]
        return (
            ' OR '.join(['aclr:%s' % r for r in acl]),
            ' OR '.join(['aclw:%s' % w for w in acl]),
        )

    @staticmethod
    def get_queryset():
        return models.Study.objects.select_related(
            'contact',
            'updated__mod_by__userprofile',
            'created__mod_by__userprofile',
        ).annotate(
            _file_count=Count('files'),
            _comment_count=Count('comments'),
        ).prefetch_related(
            Prefetch(
                'userpermission_set',
                queryset=models.UserPermission.objects.select_related('user'),
            ),
            Prefetch(
                'grouppermission_set',
                queryset=models.GroupPermission.objects.select_related('group'),
            ),
            'everyonepermission_set',
        )

    def query(self, query='', options={}):
        """ Run a query against the Solr index.

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
        return super(StudySearch, self).query(query=query, **options)

    def get_queryopt(self, query, **kwargs):
        queryopt = super(StudySearch, self).get_queryopt(query, **kwargs)
        if self.ident is None:
            raise RuntimeError('No user defined for query')
        (readable, writable) = StudySearch.build_acl_filter(self.ident)
        fq = [readable, ]
        queryopt['fl'] = '*,score,writable:exists(query({!v=\'%(aclw)s\'},0))' % {
            'aclw': writable,
        }
        if kwargs.get('edismax', False):
            queryopt['defType'] = 'edismax'
            # these are the query fields and boosts to use in EDisMax
            queryopt['qf'] = ' '.join([
                'name^10', 'name_ng', 'description^5', 'description_ng', 'contact', 'contact_ng',
                'creator_email', 'creator_name', 'creator_ng', 'initials', 'metabolite_name',
                'protocol_name', 'part_name',
            ])
            queryopt['q.alt'] = '*:*'
        if not kwargs.get('showDisabled', False):
            fq.append('active:true')
        if kwargs.get('showMine', False):
            fq.append('creator:%s' % (self.ident.pk))
        queryopt['fq'] = fq
        return queryopt


class UserSearch(SolrSearch):
    """ API to manage searching for users via Solr index """

    def __init__(self, core='users', *args, **kwargs):
        super(UserSearch, self).__init__(core=core, *args, **kwargs)

    @staticmethod
    def get_queryset():
        return get_user_model().objects.select_related(
            'userprofile',
        ).prefetch_related(
            'userprofile__institutions',
        )

    def query(self, query='is_active:true', options={}):
        """ Run a query against the Users Solr index.

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
        return super(UserSearch, self).query(query=query, **options)

    def get_queryopt(self, query, **kwargs):
        queryopt = super(UserSearch, self).get_queryopt(query, **kwargs)
        if kwargs.get('edismax', False):
            queryopt['defType'] = 'edismax'
            # these are the query fields and boosts to use in EDisMax
            queryopt['qf'] = ' '.join([
                'name^10', 'name_ng^5', 'initial_lower^5', 'group_ng', 'institution_ng',
            ])
            queryopt['q.alt'] = '*:*'
        if kwargs.get('showDisabled', False):
            queryopt['fq'] = [queryopt['fq'], 'is_active:true']
        return queryopt


class MeasurementTypeSearch(SolrSearch):
    """ API to manage searching for measurement types via Solr index """

    def __init__(self, core='measurement', *args, **kwargs):
        super(MeasurementTypeSearch, self).__init__(core=core, *args, **kwargs)

    @staticmethod
    def get_queryset():
        return models.MeasurementType.objects.annotate(
            _source_name=F('type_source__name'),
        ).select_related(
            'metabolite',
            'proteinidentifier',
            'geneidentifier',
            'phosphor',
        )

    def get_queryopt(self, query, **kwargs):
        queryopt = super(MeasurementTypeSearch, self).get_queryopt(query, **kwargs)
        queryopt['defType'] = 'edismax'
        queryopt['qf'] = ' '.join([
            'name^10',  # put high weight on matching name
            'name_edge^5',  # half as much on matching begin/end of name
            'name_ng^2',  # smaller weight on matching substring
            'synonym^8',  # high weight on matching synonyms
            'synonym_edge^4',  # half as much on matching begin/end of synonym
            'synonym_ng^2',  # smaller weight on matching substring of synonym
            'code^10',  # high weight on matching the BIGG/SBML short name
            'm_formula',  # small weight on matching formula string
        ])
        queryopt['q.alt'] = '*:*'
        if kwargs.get('family', None):
            family = kwargs['family']
            if isinstance(family, string_types):
                queryopt['fq'] = 'family:%s' % family
            else:
                queryopt['fq'] = ['family:%s' % f for f in family].join(' OR ')
        return queryopt

    def get_solr_payload(self, obj):
        Group = models.MeasurementType.Group
        try:
            if obj.type_group == Group.METABOLITE and hasattr(obj, 'metabolite'):
                item = obj.metabolite
            elif obj.type_group == Group.PROTEINID and hasattr(obj, 'proteinidentifier'):
                item = obj.proteinidentifier
            else:
                item = obj
        except Exception as e:
            logger.exception('Could not load detailed info on measurement type %s', obj.type_name)
            item = obj
        return item.to_solr_json()
