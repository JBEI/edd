# -*- coding: utf-8 -*-
"""
Contains utility classes for connecting with and gathering data from EDD's REST API. This initial
implementation, as well as the REST API itself, can use some additions/improvements over time,
but is implemented to initially fulfill the basic need to connect to EDD programmatically.
"""

import collections
import json
import logging
import requests

from datetime import datetime

from jbei.rest.api import RestApiClient
from jbei.rest.auth import EddSessionAuth
from jbei.rest.sessions import PagedResult, PagedSession, Session
from .constants import (ACTIVE_STATUS_PARAM, ASSAYS_PARAM,
                        COMPARTMENT_PARAM,
                        CREATED_AFTER_PARAM,
                        CREATED_BEFORE_PARAM, DESCRIPTION_REGEX_PARAM, EXPERIMENTERS_REQUEST_PARAM,
                        LINES_REQUEST_PARAM, MEASUREMENT_PKS_PARAM,
                        MEAS_TYPES_PARAM,
                        MEAS_TYPE_NAME_REGEX, METADATA_CONTEXT_VALUES, METADATA_TYPE_CONTEXT_PARAM,
                        METADATA_TYPE_GROUP_PARAM, METADATA_TYPE_I18N,
                        NAME_REGEX_PARAM, PAGE_NUMBER_URL_PARAM, PAGE_SIZE_QUERY_PARAM,
                        PROTOCOLS_REQUEST_PARAM, TYPE_GROUP_PARAM,
                        UNIT_NAME_REGEX_PARAM,
                        UPDATED_AFTER_PARAM, UPDATED_BEFORE_PARAM)

VERIFY_SSL_DEFAULT = Session.VERIFY_SSL_DEFAULT

# HTTP request connection and read timeouts, respectively (in seconds)
DEFAULT_REQUEST_TIMEOUT = (10, 10)
DEFAULT_PAGE_SIZE = 30

_PAGE_NUMBER_PARAM = 'page_number'
_QUERY_URL_PARAM = 'query_url'

logger = logging.getLogger(__name__)


class EddRestObject(object):
    """
    Defines the plain Python object equivalent of Django model objects persisted to EDD's
    database.  This separate object hierarchy should be used only on by external clients of EDD's
    REST API, since little-to-no validation is performed on the data stored in them.

    This separate object hierarchy that mirrors EDD's is necessary for a couple of reasons:
    1) It prevents EDD's REST API clients from having to install Django libraries that won't really
    provide any benefit on the client side
    2) It allows client and server-side code to be versioned independently, allowing for some
    wiggle room during for non-breaking API changes. For example, REST API additions on the server
    side shouldn't require updates to client code.
    3) It provides for some client-side error checking, e.g. for misspelled or misplaced query
    parameters that fail silently when provided via the REST URL

    As a result, it creates a separate object hierarchy that closely matches EDD's Django
    models, but needs to be maintained separately.

    Note that there can be some differences in defaults between EddRestObjects and the Django
    models on which they're based. While Django modules have defaults defined for application to
    related database records, EddRestObjects, which may only be partially populated from the
    ground truth in the database, use None for all attributes that arent' specifically set. This
    should hopefully help to distinguish unknown values from those that have defaults applied.
    """
    def __init__(self, **kwargs):
        self.pk = kwargs.pop('pk', None)
        self.uuid = kwargs.pop('uuid', None)
        self.name = kwargs.pop('name', None)
        self.description = kwargs.pop('description', None)
        self.active = kwargs.pop('active', None)
        self.created = kwargs.pop('created', None)
        self.updated = kwargs.pop('updated', None)
        self.meta_store = kwargs.pop('meta_store', None)

    def __str__(self):
        return self.name


class Protocol(EddRestObject):
    def __init__(self, **kwargs):
        self.owned_by = kwargs.pop('owned_by', None)
        self.variant_of = kwargs.pop('variant_of', None)
        self.default_units = kwargs.pop('default_units', None)
        self.categorization = kwargs.pop('categorization', None)
        super(Protocol, self).__init__(**kwargs)


class Line(EddRestObject):
    def __init__(self, **kwargs):
        self.study = kwargs.pop('study', None)
        self.contact = kwargs.pop('contact', None)
        self.experimenter = kwargs.pop('experimenter', None)
        self.carbon_source = kwargs.pop('carbon_source', None)
        self.strains = kwargs.pop('strains', None)
        self.control = kwargs.pop('control', None)
        super(Line, self).__init__(**kwargs)


class Assay(EddRestObject):
    def __init__(self, **kwargs):
        self.line = kwargs.pop('line', None)
        self.protocol = kwargs.pop('protocol', None)
        self.experimenter = kwargs.pop('experimenter', None)
        super(Assay, self).__init__(**kwargs)


class Study(EddRestObject):
    def __init__(self, **kwargs):
        self.contact = kwargs.pop('contact', None)
        self.contact_extra = kwargs.pop('contact_extra', None)
        self.metabolic_map = kwargs.pop('metabolic_map', None)
        self.protocols = kwargs.pop('protocols', None)
        super(Study, self).__init__(**kwargs)


class MeasurementUnit(object):
    def __init__(self, **kwargs):
        self.unit_name = kwargs.pop('unit_name', None)
        self.pk = kwargs.pop('pk', None)
        self.type_group = kwargs.pop('type_group', None)
        self.display = kwargs.pop('display', None)
        self.alternate_names = kwargs.pop('alternate_names', None)


class MeasurementType(object):
    def __init__(self, **kwargs):
        self.pk = kwargs.pop('pk')
        self.type_name = kwargs.pop('type_name')  # required
        self.type_group = kwargs.pop('type_group', None)
        self.type_source = kwargs.pop('type_source', None)
        self.uuid = kwargs.pop('uuid')


class Measurement(object):
    def __init__(self, **kwargs):
        self.pk = kwargs.pop('pk', None)
        self.assay = kwargs.pop('assay', None)
        self.experimenter = kwargs.pop('experimenter', None)
        self.measurement_type = kwargs.pop('measurement_type', None)
        self.x_units = kwargs.pop('x_units', None)
        self.y_units = kwargs.pop('y_units', None)
        self.update_ref = kwargs.pop('update_ref', None)
        self.active = kwargs.pop('active', None)
        self.compartment = kwargs.pop('compartment', None)
        self.measurement_format = kwargs.pop('measurement_format', None)


class MeasurementValue(object):
    def __init__(self, **kwargs):
        self.pk = kwargs.pop('pk', None)
        self.measurement = kwargs.pop('measurement', None)
        self.x = kwargs.pop('x', [])
        self.y = kwargs.pop('y', [])
        self.updated = kwargs.pop('updated', None)


class MetadataType(object):
    def __init__(self, **kwargs):
        self.pk = kwargs.pop('pk', None)
        self.uuid = kwargs.pop('uuid', None)
        self.group = kwargs.pop('group', None)
        self.type_name = kwargs.pop('type_name')  # required
        self.type_i18n = kwargs.get('type_i19n', None)
        self.input_size = kwargs.pop('input_size', None)
        self.input_type = kwargs.pop('input_type', None)
        self.default_value = kwargs.pop('default_value', None)
        self.prefix = kwargs.pop('prefix', None)
        self.postfix = kwargs.pop('postfix', None)
        self.for_context = kwargs.pop('for_context')  # required
        self.type_class = kwargs.pop('type_class', None)


class MetadataGroup(object):
    def __init__(self, **kwargs):
        self.group_name = kwargs['group_name']


class DrfSession(PagedSession):
    """
    A special-case Session to support CSRF token headers required by Django and the Django Rest
    Framework (DRF) to make requests to "unsafe" (mutator) REST resources. Clients of DrfSession
    can just transparently call request/post/delete/etc methods here without needing to worry
    about which methods need DRF'S CSRF header set, or the mechanics of how that's accomplished.
    :param base_url: the base url of the site where Django REST framework is being connected to.
    """

    def __init__(self, base_url, result_limit_param_name, result_limit=None,
                 timeout=DEFAULT_REQUEST_TIMEOUT, verify_ssl_cert=VERIFY_SSL_DEFAULT,
                 auth=None):
        super(DrfSession, self).__init__(
            result_limit_param_name=result_limit_param_name, result_limit=result_limit,
            timeout=timeout, verify_ssl_cert=verify_ssl_cert, auth=auth
        )
        self._base_url = base_url


def _set_multivalue_pk_input(dictionary, key, values):
    """
    A helper method for passing multivalue primary key inputs to EDD's REST API, which consumes
    them as a single comma-delimited string rather than as a multivalue request parameter.
    """
    if values:
        if isinstance(values, collections.Sequence):
            dictionary[key] = ','.join(str(item) for item in values)
        else:
            dictionary[key] = [values]


def _set_if_value_valid(dictionary, key, value):
    # utility method to get rid of long blocks of setting dictionary keys only if values valid
    if value:
        if isinstance(value, datetime):
            value = str(value)
        dictionary[key] = value


def _add_active_flag_if_present(search_params, **kwargs):
    # default to only returning active objects, unless client specifically requests to see all
    # or some subset of them (by providing parameter active=None)
    if 'active' in kwargs:
        active = kwargs.pop('active', None)
    else:
        active = True

    if active is not None:
        _set_if_value_valid(search_params, ACTIVE_STATUS_PARAM, active)

    return kwargs


class EddApi(RestApiClient):
    """
    Defines a high-level interface to EDD's REST API. The initial version of this class only
    exposes only a subset of the REST API, and will evolve over time.
    Note that data exposed via this API is subject to user and group-based access controls,
    and unlike Django ORM queries, won't necessarily reflect all the data present in the EDD
    database.

    It's also worth noting that EDD Model objects returned from EddApi purposefully prevent
    access or modifications to EDD's database, even when the appropriate Django settings are
    available on the client machine.
    """

    _json_header = {
        'Content-Type': 'application/json',
        'Media-Type': 'application/json',
        'Accept': 'application/json',
    }

    def __init__(self, auth, base_url, result_limit=DEFAULT_PAGE_SIZE, verify=True):
        """
        Creates a new instance of EddApi, which prevents data changes by default.
        :param base_url: the base URL of the EDD deployment to interface with,
            e.g. https://edd.jbei.org/. Note HTTPS should almost always be used for security.
        :param auth: a valid, authenticated EDD session from jbei.rest.auth.EddSessionAuth.login(),
            used to authorize all requests to the API.
        :param result_limit: the maximum number of results that can be returned from a single
            query, or None to apply EDD's default limit
        :return: a new EddApi instance
        """
        session = DrfSession(base_url, PAGE_SIZE_QUERY_PARAM, auth=auth, verify_ssl_cert=verify)
        if isinstance(auth, EddSessionAuth):
            auth.apply_session_token(session)
        super(EddApi, self).__init__('EDD', base_url, session, result_limit=result_limit)

    @staticmethod
    def _add_eddobject_search_params(search_params, **kwargs):
        _set_if_value_valid(search_params, NAME_REGEX_PARAM,
                            kwargs.pop('name_regex', None))
        _set_if_value_valid(search_params, DESCRIPTION_REGEX_PARAM,
                            kwargs.pop('description', None))
        _set_if_value_valid(search_params, CREATED_AFTER_PARAM,
                            kwargs.pop('created_after', None))
        _set_if_value_valid(search_params, CREATED_BEFORE_PARAM,
                            kwargs.pop('created_before', None))
        _set_if_value_valid(search_params, UPDATED_AFTER_PARAM,
                            kwargs.pop('updated_after', None))
        _set_if_value_valid(search_params, UPDATED_BEFORE_PARAM,
                            kwargs.pop('updated_before', None))
        return _add_active_flag_if_present(search_params, **kwargs)

    def search_measurement_units(self, **kwargs):
        """
        Searches EDD for the MeasurementUnits that match the search criteria
        :param query_url: the URL to query, including all desired search parameters ( e.g. as
                    returned in the "next" result from a results page).  If provided,
                    all other parameters will be ignored.
        :param unit_name_regex: a regular expression for the unit name (case-insensitive)
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """

        query_url = kwargs.get(_QUERY_URL_PARAM, None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            search_params = {}
            _set_if_value_valid(search_params, UNIT_NAME_REGEX_PARAM,
                                kwargs.pop('unit_name_regex', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))

            # make the HTTP request
            url = '%s/rest/measurement_units/' % self.base_url
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=MeasurementUnit)

    def _enforce_valid_kwargs(self, kwargs):
        if kwargs:
            raise KeyError('Invalid keyword argument(s) : %s' % kwargs)

    def search_measurement_types(self, **kwargs):
        """
        Searches EDD for the MeasurementTypes that match the search criteria
        :param query_url: the URL to query, including all desired search parameters (e.g. as
                    returned in the "next" result from a results page).  If provided, all other
                    parameters will be ignored.
        :param type_name_regex: a regular expression for the name (case-insensitive)
        :param type_group: the primary key f the type group to filter results for
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """
        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            search_params = {}
            _set_if_value_valid(search_params, MEAS_TYPE_NAME_REGEX,
                                kwargs.pop('type_name_regex', None))
            _set_if_value_valid(search_params, TYPE_GROUP_PARAM,
                                kwargs.pop('type_group', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))
            self._enforce_valid_kwargs(kwargs)

            # make the HTTP request
            url = '%s/rest/measurement_types/' % self.base_url
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=MeasurementType)

    def search_measurements(self, **kwargs):
        """
        Searches EDD for the Measurements that match the search criteria
        :param study_id: the primary key or UUID of the study to search in.
        :param active: optionally filter objects by 'active' status.  If not provided,
            only active objects are returned by default, or set active=None to return all objects.
        :param assays: an iterable of assay pk's to use in filtering measurements.
        :param compartment: which cellular compartment to filter measurements for.
        :param measurement_types: an iterable of MeasurementType pk's to use in filtering
                measurements.  Only measurements of the provided types will be returned.
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.
        :param x_units: one or more primary keys for units that measurements will be filtered by
        :param y_units: one or more primary keys for units that measurements will be filtered by
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """
        query_url = kwargs.pop('query_url', None)
        study_id = kwargs.pop('study_id', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            if study_id:
                url = '%(base)s/rest/studies/%(study_id)s/measurements/' % {
                    'base': self.base_url,
                    'study_id': study_id, }
            else:
                url = '%s/rest/measurements/' % self.base_url

            search_params = {}
            _set_multivalue_pk_input(search_params, ASSAYS_PARAM,
                                     kwargs.pop('assays', None))
            _set_multivalue_pk_input(search_params, MEAS_TYPES_PARAM,
                                     kwargs.pop('measurement_types', None))
            _set_multivalue_pk_input(search_params, 'x_units__in',
                                     kwargs.pop('x_units', None))
            _set_multivalue_pk_input(search_params, 'y_units__in',
                                     kwargs.pop('y_units', None))
            _set_if_value_valid(search_params, COMPARTMENT_PARAM,
                                kwargs.pop('compartment', None))
            _set_if_value_valid(search_params, CREATED_AFTER_PARAM,
                                kwargs.pop('created_after', None))
            _set_if_value_valid(search_params, CREATED_BEFORE_PARAM,
                                kwargs.pop('created_before', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))

            unprocessed_kwargs = _add_active_flag_if_present(search_params, **kwargs)
            self._enforce_valid_kwargs(unprocessed_kwargs)

            # make the HTTP request
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=Measurement)

    def search_values(self, **kwargs):
        """
        Searches EDD for the Measurements that match the search criteria
        :param study_id: the primary key or UUID of the study to search in.
        :param measurements: one or more measurement pks to filter values by
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """

        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            study_id = kwargs.pop('study_id', None)
            if study_id:
                url = '%(base)s/rest/studies/%(study_id)s/values/' % {
                    'base': self.base_url,
                    'study_id': study_id, }
            else:
                url = '%s/rest/values/' % self.base_url

            search_params = {}
            _set_multivalue_pk_input(search_params, MEASUREMENT_PKS_PARAM,
                                     kwargs.pop('measurements', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))
            self._enforce_valid_kwargs(kwargs)

            # make the HTTP request
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=MeasurementValue)

    def _detect_invalid_kwargs(self, **kwargs):
        if kwargs:
            raise KeyError('Unsupported kwargs: %s' % kwargs)

    def get_metadata_type(self, id):
        """
        Queries EDD to get the MetadataType uniquely identified by local numeric primary key,
        by i18n string, or by the combination of
        :return: the MetadaDataType, or None
        :raises: requests.HttpError, if one occurs
        """
        # make the HTTP request
        url_pattern = '%(base)s/rest/metadata_types/%(id)s'
        return self._get_single_object(id, url_pattern, MetadataType)

    def get_measurement_unit(self, id):
        """
        Gets the MeasurementUnit identified by the provided ID
        :param id: the unique identifier (either a UUID or integer primary key)
        :return: the MeasurementUnit, or None if none was found using the provided identifier
        :raises: requests.HttpError, if one occurs
        """
        url_pattern = '%(base)s/rest/measurement_units/%(id)s'
        return self._get_single_object(id, url_pattern, MeasurementUnit)

    def search_metadata_types(self, **kwargs):
        """
        Searches EDD for the MetadataType(s) that match the search criteria
        :param query_url: the URL to query, including all desired search parameters (e.g. as
                    returned in the "next" result from a results page).  If provided, all other
                    parameters will be ignored.
        :param for_context: the context for the metadata to be searched. Must be in
            METADATA_CONTEXT_VALUES
        :param group: the primary key for the group this metadata is part of
        :param type_i18n:
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """
        for_context = kwargs.pop('for_context', None)
        if for_context and for_context not in METADATA_CONTEXT_VALUES:
            raise ValueError('context \"%s\" is not a supported value' % for_context)

        # build up a dictionary of search parameters based on provided inputs
        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            search_params = {}
            _set_if_value_valid(search_params, METADATA_TYPE_CONTEXT_PARAM, for_context)
            _set_if_value_valid(search_params,
                                METADATA_TYPE_GROUP_PARAM,
                                kwargs.get('group', None))
            _set_if_value_valid(search_params,
                                METADATA_TYPE_I18N,
                                kwargs.pop('type_i18n', None))
            _set_if_value_valid(search_params, PAGE_SIZE_QUERY_PARAM, self.result_limit)
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))

            self._enforce_valid_kwargs(kwargs)

            # make the HTTP request
            url = '%s/rest/metadata_types' % self.base_url
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=MetadataType)

    def get_protocol(self, id=None):
        """
        Queries EDD to get the Protocol a single protocol
        :param id: either a UUID that uniquely identifies this Protocol, or an integer
        primary key that identifies it uniquely within the context of a single EDD deployment.
        :return: the Protocol or None
        :raises: requests.HttpError if one occurs
        """
        # make the HTTP request
        url_pattern = '%(base)s/rest/protocols/%(id)s'
        return self._get_single_object(id, url_pattern, Protocol)

    def get_measurement_type(self, unique_id=None):
        """
        Queries EDD to get a single MeasurementType
        :param unique_id: either a UUID that uniquely identifies this MeasurementTYpe,
        or an integer primary key that identifies it uniquely within the context of a single EDD
        deployment.
        :return: the MeasurementType or None
        :raises: requests.HttpError, if one occurs
        """
        # make the HTTP request
        url_pattern = '%(base)s/rest/measurement_types/%(id)d'
        return self._get_single_object(unique_id, url_pattern, MeasurementType)

    def _get_single_object(self, unique_id, url_pattern, result_class):
        url = url_pattern % {
            'base': self.base_url,
            'id': unique_id,
        }
        response = self.session.get(url, headers=self._json_header)

        if response.status_code == requests.codes.not_found:
            return None
        response.raise_for_status()  # raise an Exception for unexpected reply
        kwargs = json.loads(response.text)
        return result_class(**kwargs)

    def search_protocols(self, **kwargs):
        """
        Searches EDD for protocols according to the parameters.
        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.

        :param name_regex: a regular expression for the name (case-insensitive).
        :param description_regex: a regular expression for the description (case-insensitive)
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param updated_after: a datetime used to filter objects by update date (inclusive)
        :param updated_before: a datetime used to filter objects by creation date (inclusive)
        :param active: optionally filter objects by 'active' status.  If not provided,
            only active objects are returned by default, or set active=None to return all objects.
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """

        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            search_params = {}
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))
            unprocessed_kwargs = self._add_eddobject_search_params(search_params, **kwargs)
            self._enforce_valid_kwargs(unprocessed_kwargs)

            # make the HTTP request
            url = '%s/rest/protocols/' % self.base_url
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=Protocol)

    def search_studies(self, **kwargs):
        """
        Searches EDD for studies according to the parameters.

        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.
        :param slug: the slug (URL portion) that uniquely identifies the study within this
            DD instance.  This is the URL portion visible in the web browser when
            accessing a study.
        :param name_regex: a regular expression for the name (case-insensitive).
        :param description_regex: a regular expression for the description (case-insensitive)
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param updated_after: a datetime used to filter objects by update date (inclusive)
        :param updated_before: a datetime used to filter objects by creation date (inclusive)
        :param active: optionally filter objects by 'active' status.  If not provided,
            only active objects are returned by default, or set active=None to return all
            objects.
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """

        url = '%s/rest/studies/' % self.base_url

        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(url, headers=self._json_header)
        else:
            search_params = {}
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop('page_number', None))
            _set_if_value_valid(search_params, 'slug', kwargs.pop('slug', None))
            unprocessed_kwargs = self._add_eddobject_search_params(search_params, **kwargs)
            self._enforce_valid_kwargs(unprocessed_kwargs)

            # make the HTTP request
            response = self.session.get(url, params=search_params, headers=self._json_header)

        # throw an error for unexpected reply
        if response.status_code != requests.codes.ok:
            response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=Study)

    def search_lines(self, **kwargs):
        """
        Searches EDD for lines according to the parameters.
        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.
        :param strains: one or more UUIDs or ICE UI URL's for strains to filter lines for.  If the
        line contains any of the provided strains, it will be returned in the results.
        :param name_regex: a regular expression for the name (case-insensitive).
        :param description_regex: a regular expression for the description (case-insensitive)
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param updated_after: a datetime used to filter objects by update date (inclusive)
        :param updated_before: a datetime used to filter objects by creation date (inclusive)
        :param active: optionally filter objects by 'active' status.  If not provided,
            only active objects are returned by default, or set active=None to return
            all objects.
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """
        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            study_id = kwargs.pop('study_id', None)
            if study_id:
                url = '%(base)s/rest/studies/%(study_id)s/lines/' % {
                    'base': self.base_url,
                    'study_id': study_id,
                }
            else:
                url = '%s/rest/lines/' % self.base_url

            search_params = {}
            _set_multivalue_pk_input(search_params, 'strains__in', kwargs.pop('strains', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))
            unprocessed_kwargs = self._add_eddobject_search_params(search_params, **kwargs)
            self._enforce_valid_kwargs(unprocessed_kwargs)

            response = self.session.get(url, params=search_params, headers=self._json_header)

        response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=Line)

    def search_assays(self, **kwargs):
        """
        Searches EDD for lines according to the parameters.
        :param study_id: the primary key or UUID of the study to search for assays in
        :param lines: one or more Line primary keys to use in filtering protocols
        :param protocols: one or more Protocol primary keys to use in filtering assays
        :param experimenters: one or more experimenter primary keys to use in filtering protocols
        :param query_url: the URL to query, including all desired search parameters (e.g. as
            returned in the "next" result from a results page).  If provided, all other
            parameters will be ignored.
        :param name_regex: a regular expression for the name (case-insensitive).
        :param description_regex: a regular expression for the description (case-insensitive)
        :param created_after: a datetime used to filter objects by creation date (inclusive)
        :param created_before: a datetime used to filter objects by creation date (inclusive)
        :param updated_after: a datetime used to filter objects by update date (inclusive)
        :param updated_before: a datetime used to filter objects by creation date (inclusive)
        :param active: optionally filter objects by 'active' status.  If not provided,
            only active objects are returned by default, or set active=None to return
            all objects.
        :param page_number: optional results page number to request (defaults to 1)
        :return: a DrfPagedResult object containing results or None if none were found
        :raises: requests.HttpError if one occurs
        """
        query_url = kwargs.pop('query_url', None)
        if query_url:
            response = self.session.get(query_url, headers=self._json_header)
        else:
            study_id = kwargs.pop('study_id', None)
            if study_id:
                url = '%(base)s/rest/studies/%(study_id)s/assays/' % {
                    'base': self.base_url,
                    'study_id': study_id,
                }
            else:
                url = '%s/rest/assays/' % self.base_url
            search_params = {}
            _set_multivalue_pk_input(search_params, PROTOCOLS_REQUEST_PARAM,
                                     kwargs.pop('protocols', None))
            _set_multivalue_pk_input(search_params, LINES_REQUEST_PARAM,
                                     kwargs.pop('lines', None))
            _set_multivalue_pk_input(search_params, EXPERIMENTERS_REQUEST_PARAM,
                                     kwargs.pop('experimenters', None))
            _set_if_value_valid(search_params, PAGE_NUMBER_URL_PARAM,
                                kwargs.pop(_PAGE_NUMBER_PARAM, None))
            unprocessed_kwargs = self._add_eddobject_search_params(search_params, **kwargs)
            self._enforce_valid_kwargs(unprocessed_kwargs)

            response = self.session.get(url, params=search_params, headers=self._json_header)

        response.raise_for_status()

        return DrfPagedResult.of(response.text, model_class=Assay)

    def get_study(self, id):
        """
        Gets the study identified by the provided ID
        :param id: the unique identifier (either a UUID or integer primary key)
        :return: the study, or None if none was found using the provided identifier
        :raises requests.HttpError, if one occurs
        """
        url = '%(base)s/rest/studies/%(id)s/'
        return self._get_single_object(id, url, Study)

    def get_abs_study_browser_url(self, study_pk, alternate_base_url=None):
        """
        Gets the absolute URL of the user interface for the study with the provided primary key.
        """
        # Note: we purposefully DON'T use reverse() here since this code runs outside the context
        # of Django, if the library is even installed (it shouldn't be required).
        # Note: although it's normally best to abstract the URLs away from clients, in this case
        # clients will need the URL to push study link updates to ICE.
        base_url = alternate_base_url if alternate_base_url else self.base_url

        # chop off a trailing slash in the base_url, if present
        base_url = base_url if base_url.endswith('/') else base_url[:len(base_url)-1]
        return "%s/studies/%s/" % (base_url, study_pk)


class DrfPagedResult(PagedResult):

    def __init__(self, results, total_result_count, next_page=None, previous_page=None):
        super(DrfPagedResult, self).__init__(results, total_result_count, next_page, previous_page)

    @staticmethod
    def of(json_string, model_class):
        """
        Gets a PagedResult containing object results from the provided JSON input. For consistency,
        the result is always a PagedResult, even if the JSON response actually included the full
        set of results.

        :param json_string: the raw content of the HTTP response containing potentially paged
            content
        :param model_class: the class object to use in instantiating object instances to capture
            individual query results
        :param serializer_class: the serializer class to use in deserializing result data
        :param prevent_mods: True to prevent database modifications via returned Django model
            objects, which may not be fully populated with the full compliment of data required for
            database storage.
        :return: a PagedResult containing the data and a sufficient information for finding the
            rest of it (if any)
        """
        # TODO: try to merge with IcePagedResult.of(), then move implementation to parent
        # class.  Initial attempt here was to use DRF serializers for de-serialization, which may
        # be worth another shot following corrected use of super() in those classes.
        # Otherwise, more Pythonic to just use a factory method. Also update IcePagedResult for
        # consistency.

        # convert reply to a dictionary of native python data types
        json_dict = json.loads(json_string)

        if not json_dict:
            return None

        count = None
        next_page = None
        prev_page = None
        results_obj_list = []

        # IF response is paged, pull out paging context
        if 'results' in json_dict:
            next_page = json_dict.get('next', None)
            prev_page = json_dict.get('previous', None)
            count = json_dict.get('count', None)

            if count == 0:
                return None

            # iterate through the returned data, deserializing each object found
            response_content = json_dict.get('results', {})
            for object_dict in response_content:
                # using parallel object hierarchy to Django model objects. Note that input isn't
                # validated, but that shouldn't really be an issue on the client side,
                # so long as the server connection is secure / trusted
                result_object = model_class(**object_dict)

                results_obj_list.append(result_object)

        # otherwise just deserialize the data
        else:
            result_object = model_class(**json_dict)
            count = 1
            results_obj_list.append(result_object)

        return DrfPagedResult(results_obj_list, count, next_page, prev_page)
