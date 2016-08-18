# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import logging
import requests

from builtins import str
from django.conf import settings as django_settings
from django.db.models import F

from . import models, utilities


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

        if response.status_code != requests.codes.ok:
            response.raise_for_status()  # raises HttpError (extends IOError)

    def get_solr_payload(self, obj):
        return obj.to_solr_json()

    def get_queryopt(self, query, **kwargs):
        queryopt = {
            'indent': True,
            'q': query,
            'start': kwargs.get('i', 0),
            'rows': kwargs.get('size', 50),
            'sort': kwargs.get('sort', None),
            'wt': 'json',
            'fl': '*',
        }
        return queryopt

    def remove(self, docs=[]):
        """
            Updates Solr with a list of objects to remove from the index.

            :param docs: an iterable of objects with an id property

            :raises IOError: if an error occurs during the removal attempt. Note that removals
            are performed iteratively, so it's possible that some succeeded before the error
            occurred.
        """
        # Does no permissions checking; permissions already valid if called from Study pre_delete
        # signal, but other clients must do their own permission checks.
        url = self.url + '/update/json'
        # proactively log input to help diagnose integration errors, if they occur
        logger.info("%(class_name)s.%(method_name)s: %(params)s" % {
            'class_name': self.__class__.__name__,
            'method_name': self.remove.__name__,
            'params': 'url=%(url)s, doc ids = %(doc_ids)s' % {
                'doc_ids': str([doc.id for doc in docs]),
                'url': url, }})
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
            # catch / re-raise communication errors after logging some helpful context re: where
            # the error occurred
            except IOError as err:
                # log the doc id on which the error occurred, then re-raise the error
                logger.error('Error removing data from Solr index. Failed on doc id %s', doc.id)
                raise err
            else:
                # if we got an error response from Solr, log some context re: when the error
                # occurred, then raise an HttpError (extents IOError noted in docstring / thrown
                # above)
                if response.status_code != requests.codes.ok:
                    # log the doc id on which the problem occurred, then raise an HttpError
                    logger.error(
                        'Error removing data from Solr index. Failed on doc id %s', doc.id
                    )
                    response.raise_for_status()

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
        logger.info("%(class_name)s.%(method_name)s: %(params)s" % {
            'class_name': self.__class__.__name__,
            'method_name': self.search.__name__,
            'params': ('queryopt=%s' % str(queryopt))
        })

        # contact Solr / raise any IOErrors that arise
        response = requests.get(self.url + '/select', params=queryopt, timeout=timeout)

        if response.status_code == requests.codes.ok:
            return response.json()
        else:
            # if we got an error response from Solr, log some context re: when the error
            # occurred, then raise an HttpError (extents IOError noted in docstring maybe thrown
            # by GET above)
            response.raise_for_status()

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
        :return: Solr's JSON response, if the add was successfully performed.
        :raises IOError: if an error occurs during the update attempt
        """
        url = self.url + '/update/json'
        payload = filter(lambda d: d is not None, map(self.get_solr_payload, docs))

        # proactively log input to help diagnose integration errors, if they occur
        logger.info("%(class_name)s.%(method_name)s: %(params)s" % {
            'class_name': self.__class__.__name__, 'method_name': self.update.__name__,
            'params': 'url=%(url)s, doc ids = %(doc_ids)s' % {
                'doc_ids': str([doc.id for doc in docs]),
                'url': url,
            }
        })

        headers = {'content-type': 'application/json'}
        # make an initial request to do the add / raise IOError if it occurs
        response = requests.post(
            url,
            data=json.dumps(payload, cls=utilities.JSONDecimalEncoder),
            headers=headers,
            timeout=timeout,
        )

        # if we received a valid response with an HTTP error code, raise HttpException (
        # extends IOError that may also be raised above)
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        # if the add worked, send commit command
        add_json = response.json()
        response = requests.post(
            url,
            data='{"commit":{}}',
            headers=headers,
            timeout=timeout,
        )  # raises IOError
        if response.status_code == requests.codes.ok:
            return add_json
        else:
            response.raise_for_status()  # raises HttpError (extends IOError)

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
        acl = ['"g:__Everyone__"', '"u:'+ident.username+'"', ] + map(
            lambda g: '"g:'+g.name+'"', ident.groups.all()
        )
        return (
            ' OR '.join(map(lambda r: 'aclr:'+r, acl)),
            ' OR '.join(map(lambda w: 'aclw:'+w, acl)),
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


class MetaboliteSearch(SolrSearch):
    """ API to manage searching for metabolites via Solr index """

    def __init__(self, core='metabolite', *args, **kwargs):
        super(MetaboliteSearch, self).__init__(core=core, *args, **kwargs)

    @staticmethod
    def get_queryset():
        return models.Metabolite.objects.annotate(_source_name=F('source__name'))

    def get_queryopt(self, query, **kwargs):
        queryopt = super(MetaboliteSearch, self).get_queryopt(query, **kwargs)
        queryopt['defType'] = 'edismax'
        queryopt['qf'] = ' '.join([
            'name^10', 'name_edge^5', 'name_ng^2', 'code^10', 'formula', 'tags',
        ])
        queryopt['q.alt'] = '*:*'
        return queryopt

    def get_solr_payload(self, obj):
        if isinstance(obj, models.Metabolite):
            return {
                'id': obj.id,
                'name': obj.type_name,
                'code': obj.short_name,
                'charge': obj.charge,
                'carbons': obj.carbon_count,
                'mass': obj.molar_mass,
                'formula': obj.molecular_formula,
                'tags': list(obj.tags),
                # use the annotated attr if present, otherwise must make a new query
                'source': obj._source_name if hasattr(obj, '_source_name') else obj.source.name,
            }
        # still supporting 'metaboliteish'
        elif (isinstance(obj, models.MeasurementType) and
              obj.type_group == models.MeasurementType.Group.GENERIC):
            return {
                'id': obj.id,
                'name': obj.type_name,
            }
        return None
