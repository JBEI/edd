"""
Defines the supported views for EDD's REST framework. This class is a work in progress.

Assuming Django REST Framework (DRF) will be adopted in EDD, new and existing views should be
ported to this class over time. Many REST resources are currently defined in main/views.py,
but are not making use of DRF.
"""

import logging
import re
from uuid import UUID

from rest_framework.exceptions import ParseError


from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.shortcuts import get_object_or_404

from edd.rest.serializers import (LineSerializer, MetadataGroupSerializer, MetadataTypeSerializer,
                                  StrainSerializer, StudySerializer, UserSerializer,
                                  ProtocolSerializer, MeasurementUnitSerializer)
from jbei.rest.clients.edd.constants import (
    CASE_SENSITIVE_PARAM, LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT, METADATA_TYPE_CONTEXT,
    METADATA_TYPE_GROUP, METADATA_TYPE_I18N, METADATA_TYPE_LOCALE, METADATA_TYPE_NAME_REGEX,
    QUERY_ACTIVE_OBJECTS_ONLY, QUERY_ALL_OBJECTS, QUERY_INACTIVE_OBJECTS_ONLY,
    STRAIN_CASE_SENSITIVE, STRAIN_NAME, STRAIN_NAME_REGEX, STRAIN_REGISTRY_ID,
    STUDY_LINE_NAME_REGEX, STRAIN_REGISTRY_URL_REGEX, CREATED_AFTER_PARAM, CREATED_BEFORE_PARAM,
    UPDATED_BEFORE_PARAM, UPDATED_AFTER_PARAM)
from jbei.rest.utils import is_numeric_pk
from main.models import (Line, MeasurementUnit, MetadataGroup, MetadataType, Protocol, Strain,
                         Study, StudyPermission, User)
from rest_framework import (status, viewsets)
from rest_framework.exceptions import APIException
from rest_framework.relations import StringRelatedField
from rest_framework.response import Response


logger = logging.getLogger(__name__)

# class IsStudyReadable(permissions.BasePermission):
#     """
#     Custom permission to only allow owners of an object to edit it.
#     """
#
#     def has_object_permission(self, request, view, study):
#
#         # studies are only available to users who have read permissions on them
#         return study.user_can_read(request.user)

STRAIN_NESTED_RESOURCE_PARENT_PREFIX = r'strain'

STUDY_URL_KWARG = 'study'
BASE_STRAIN_URL_KWARG = 'id'  # NOTE: value impacts url kwarg names for nested resources
HTTP_MUTATOR_METHODS = ('POST', 'PUT', 'PATCH', 'UPDATE', 'DELETE')

SORT_PARAM = 'sort_order'
FORWARD_SORT_VALUE = 'ascending'
REVERSE_SORT_VALUE = 'descending'

# TODO: consider for all models below:
#   # Required for DjangoModelPermissions bc of get_queryset() override.
#   # See http://www.django-rest-framework.org/api-guide/permissions/#djangomodelpermissions
#   queryset = Strain.objects.none()
#   permissionClasses = (IsAuthenticated,) for views dependent on custom Study permissions


class MetadataTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports viewing and searching .EDD's metadata types
    TODO: implement/confirm access controls for unsafe methods, then make writable
    """
    queryset = MetadataType.objects.all()  # must be defined for DjangoModelPermissions
    serializer_class = MetadataTypeSerializer
    TYPE_NAME_PROPERTY = 'type_name'

    def get_queryset(self):
        pk = self.kwargs.get('pk', None)

        queryset = MetadataType.objects.all()
        if pk:
            queryset = queryset.filter(pk=pk)

        params = self.request.query_params
        if params:
            # group id
            group_id = params.get(METADATA_TYPE_GROUP)
            if group_id:
                if is_numeric_pk(group_id):
                    queryset = queryset.filter(group=group_id)
                else:
                    queryset = queryset.filter(group__group_name=group_id)

            # for context
            for_context = params.get(METADATA_TYPE_CONTEXT)
            if for_context:
                queryset = queryset.filter(for_context=for_context)

            # type I18N
            type_i18n = params.get(METADATA_TYPE_I18N)
            if type_i18n:
                queryset = queryset.filter(type_i18n=type_i18n)

            # sort
            sort = params.get(SORT_PARAM)

            if sort is not None:
                queryset = queryset.order_by(self.TYPE_NAME_PROPERTY)

                if sort == REVERSE_SORT_VALUE:
                    queryset = queryset.reverse()

            queryset = _optional_regex_filter(params, queryset, self.TYPE_NAME_PROPERTY,
                                              METADATA_TYPE_NAME_REGEX,
                                              METADATA_TYPE_LOCALE, )
        return queryset

OWNED_BY = 'owned_by'
VARIANT_OF = 'variant_of'
DEFAULT_UNITS_QUERY_PARAM = 'default_units'
CATEGORIZATION_QUERY_PARAM = 'categorization'


# TODO: make writable for users with permission
class MeasurementUnitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MeasurementUnit.objects.all()  # must be defined for DjangoModelPermissions
    serializer_class = MeasurementUnitSerializer

    # API query parameter names...may diverge from Django Model field names over time
    unit_name_param = 'unit_name'
    alternate_names_param = 'alternate_names'
    type_group_param = 'type_group'

    def get_queryset(self):
        pk = self.kwargs.get('pk', None)

        queryset = MeasurementUnit.objects.all()

        if pk:
            queryset = queryset.filter(pk=pk)

        params = self.request.query_params

        i18n_placeholder = ''

        queryset = _optional_regex_filter(params, queryset, 'unit_name', self.unit_name_param,
                                          i18n_placeholder)

        queryset = _optional_regex_filter(params, queryset, 'alternate_names',
                                          self.alternate_names_param, i18n_placeholder)

        queryset = _optional_regex_filter(params, queryset, 'type_group', self.type_group_param,
                                          i18n_placeholder)
        return queryset


# TODO: make writable for users with permission
class ProtocolViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Protocol.objects.all()  # must be defined for DjangoModelPermissions
    serializer_class = ProtocolSerializer

    # Django model object property (used several times)
    NAME_PROPERTY = 'name'

    # API query parameter names...may diverge from Django Model field names over time
    NAME_QUERY_PARAM = 'name'
    OWNED_BY_QUERY_PARAM = 'owned_by'
    CATEGORIZATION_PROPERTY = 'categorization'
    DEFAULT_UNITS_PROPERTY = 'default_units'

    def get_queryset(self):
        pk = self.kwargs.get('pk', None)

        queryset = Protocol.objects.all()
        if pk:
            if is_numeric_pk(pk):
                queryset = queryset.filter(pk=pk)
            # TODO: revisit / retest UUID-based lookup...not working
            else:
                queryset = queryset.filter(uuid=pk)

        i18n_placeholder = ''  # TODO: implement if I18N implemented for Protocol model

        params = self.request.query_params
        if params:
            # owned by
            owned_by = params.get(OWNED_BY)
            if is_numeric_pk(owned_by):
                queryset = queryset.filter(owned_by=owned_by)
            else:
                # first try UUID-based input since UUID instantiation is the best way to error check
                # UUID input
                try:
                    queryset = queryset.filter(owned_by__uuid=owned_by)
                except Exception:
                    # if this wasn't a valid UUID, assume it's a regex for the username
                    queryset = _optional_regex_filter(params, queryset, 'owned_by__username',
                                                      self.OWNED_BY_QUERY_PARAM,
                                                      i18n_placeholder)

            # variant of
            variant_of = params.get(VARIANT_OF)
            if variant_of:
                queryset = queryset.filter(variant_of=variant_of)

            # default units
            default_units = params.get(DEFAULT_UNITS_QUERY_PARAM)
            if default_units:
                if is_numeric_pk(default_units):
                    queryset = queryset.filter(default_units=default_units)
                # first try UUID-based input since UUID instantiation is the best way to error check
                # UUID input
                try:
                    queryset = queryset.filter(default_units__uuid=default_units)
                except Exception:
                    # if this wasn't a valid UUID, assume it's a regex for the unit name

                    queryset = _optional_regex_filter(params, queryset,
                                                         'default_units__unit_name',
                                                      DEFAULT_UNITS_QUERY_PARAM,
                                                      i18n_placeholder)
            # categorization
            queryset = _optional_regex_filter(params, queryset, 'categorization',
                                              CATEGORIZATION_QUERY_PARAM, i18n_placeholder)

            # sort (based on name)
            sort = params.get(SORT_PARAM)
            if sort is not None:
                queryset = queryset.order_by(self.NAME_PROPERTY)

                if sort == REVERSE_SORT_VALUE:
                    queryset = queryset.reverse()

            queryset = _optional_regex_filter(params, queryset, self.NAME_PROPERTY,
                                              self.NAME_QUERY_PARAM, i18n_placeholder)

            queryset = _optional_timestamp_filter(queryset, self.request.query_params)

        return queryset


def _optional_regex_filter(query_params_dict, queryset, data_member_name, regex_param_name,
                           locale_param_name):
    """
    Implements consistent regular expression matching behavior for EDD's REST API. Applies
    default behaviors re: case-sensitivity to all regex-based searches in the REST API.
    :param queryset: the queryset to filter based on the regular expression parameter
    :param data_member_name the django model data member name to be filtered according to the
        regex, if present
    :param regex_param_name: the query parameter name REST API clients use to pass the regular
        expression used for the search
    :param locale_param_name: the query parameter name REST API clients use to pass the locale used
        to determine which strings the regular expression is tested against
    :return: the queryset, filtered using the regex, if available
    """
    # TODO: do something with locale, which we've at least forced clients to provide to simplify
    # future full i18n support

    regex_value = query_params_dict.get(regex_param_name)
    if not regex_value:
        return queryset

    case_sensitive_search = CASE_SENSITIVE_PARAM in query_params_dict
    search_type = 'regex' if case_sensitive_search else 'iregex'
    filter_param = '%(data_member_name)s__%(search_type)s' % {
        'data_member_name': data_member_name,
        'search_type': search_type
    }

    return queryset.filter(**{filter_param: regex_value})


class MetadataGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that supports view-only access to EDD's metadata groups.
    TODO: implement/confirm access controls for unsafe methods, then make this writable
    """
    queryset = MetadataGroup.objects.all()  # must be defined for DjangoModelPermissions
    serializer_class = MetadataGroupSerializer


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows privileged users to get read-only information on the current set of
    EDD user accounts.
    """
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.filter(self.kwargs['user'])


class StrainViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users with appropriate access to get strain information.
    Support is provided for:

    1) Flexible searching of strains
    2) Access to a detailed view of a strain, based on local numeric primary key OR on the UUID
    from ICE
    """
    serializer_class = StrainSerializer
    lookup_url_kwarg = BASE_STRAIN_URL_KWARG
    # lookup_value_regex = PK_OR_UUID_REGEX # TODO: implement or remove

    def get_object(self):
        """
        Overrides the default implementation to provide flexible lookup for Strain detail
        views (either based on local numeric primary key, or based on the strain UUID from ICE
        """
        # unlike the example, just do all the filtering in get_queryset() for consistency
        filters = {}
        queryset = self.get_queryset()

        obj = get_object_or_404(queryset, **filters)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        """
        Overrides the default implementation to provide:
        * flexible filtering based on a number of useful input parameters
        * flexible strain lookup by local numeric pk OR by UUID from ICE
        :return:
        """

        logger.debug('in %s' % self.get_queryset.__name__)
        # parse optional query parameters

        # build a query, filtering by the provided user inputs
        query = Strain.objects.all()

        # if a strain UUID or local numeric pk was provided, get it
        if self.kwargs:
            strain_id_filter = self.kwargs.get(self.lookup_url_kwarg)
            if is_numeric_pk(strain_id_filter):
                query = Strain.objects.filter(pk=strain_id_filter)
            else:
                query = Strain.objects.filter(registry_id=strain_id_filter)
        # otherwise, we're searching strains, so filter them according to the provided params
        else:
            query_params = self.request.query_params
            strain_id_filter = query_params.get(self.lookup_url_kwarg)
            local_pk_filter = query_params.get('pk')
            registry_id_filter = query_params.get(STRAIN_REGISTRY_ID)
            registry_url_regex_filter = query_params.get(STRAIN_REGISTRY_URL_REGEX)
            case_sensitive = query_params.get(STRAIN_CASE_SENSITIVE)
            name_filter = query_params.get(STRAIN_NAME)

            # if provided an ambiguously-defined unique ID for the strain, apply it based
            # on the format of the provided value
            if strain_id_filter:
                if is_numeric_pk(strain_id_filter):
                    query = query.filter(pk=strain_id_filter)
                else:
                    query = query.filter(registry_id=strain_id_filter)

            if local_pk_filter:
                query = query.filter(pk=local_pk_filter)

            if registry_id_filter:
                query = query.filter(registry_id=registry_id_filter)

            if registry_url_regex_filter:
                if case_sensitive:
                    query = query.filter(registry_url__regex=registry_url_regex_filter)
                else:
                    query = query.filter(registry_url__iregex=registry_url_regex_filter)

            if name_filter:
                if case_sensitive:
                    query = query.filter(name__contains=name_filter)
                else:
                    query = query.filter(name__icontains=name_filter)

            query = _optional_regex_filter(query_params, query, 'name', STRAIN_NAME_REGEX, None)
            query = _optional_timestamp_filter(query, query_params)

        query = query.select_related('object_ref')

        logger.debug('StrainViewSet query count=%d' % query.count())
        if query.count() < 10:
            logger.debug(query)

        return query


class LineViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Lines to we viewed or edited.
    TODO: add edit/create capability back in, based on study-level permissions
    """
    queryset = Line.objects.all()
    serializer_class = LineSerializer
    contact = StringRelatedField(many=False)
    experimenter = StringRelatedField(many=False)

    def get_queryset(self):
        query = Line.objects.all()

        # filter by line active status, applying the default (only active lines)
        params = self.request.query_params
        active_status = params.get(LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT)
        query = filter_by_active_status(query, active_status, '')
        # TODO: implement / test optional name regex filter
        query = _optional_timestamp_filter(query, params)
        query = query.select_related('object_ref')
        return query


def filter_by_active_status(queryset, active_status=QUERY_ACTIVE_OBJECTS_ONLY, query_prefix=''):
    """
    A helper method for queryset filtering based on a standard set of HTTP request
    parameter values that indicate whether EddObjects should be considered in the query based on
    their 'active' status.

    For a single object class A related to the ORM model class B returned from the query, a call to
    filter_by_active_status() will filter the query according to A's 'active' status. Note
    that this filtering by active status will result in the queryset returning one row for each
    relations of A to B, so clients will often want to use distinct() to limit the returned
    results.  A typical use of this method is to control which lines are considered
    in a query.

    Example 1 : Finding only active Lines. This is slightly more code than to just filter the
                query directly, but that wouldn't be standard across REST resource implementations.

    queryset = Line.objects.all()
    queryset = filter_by_active_status(queryset, active_status=ACTIVE_ONLY,
                                       query_prefix='').distinct()

    Example 2: Finding Strains associated with a Study by active lines

    queryset = Strain.objects.filter(line__study__pk=study_id)
    queryset = filter_by_active_status(queryset, active_status=ACTIVE_ONLY,
                                       query_prefix=('line__')).distinct()

    :param queryset: the base queryset to apply filtering to
    :param active_status: the HTTP request query parameter whose value implies the type of
    filtering to apply based on active status. If this isn't one of the recognized values,
    the default behavior is applied, filtering out inactive objects. See
    constants.ACTIVE_STATUS_OPTIONS.
    :param query_prefix: an optional keyword prefix indicating the relationship of the filtered
    class to the model we're querying (see examples above)
    :return: the input query, filtered according to the parameters
    """
    active_status = active_status.lower()

    # just return the parameter if no extra filtering is required
    if active_status == QUERY_ALL_OBJECTS:
        return queryset

    # construct an ORM query keyword based on the relationship of the filtered model class to the
    # Django model class being queried. For example 1 above, when querying Line.objects.all(),
    # we prepend '' and come up with Q(active=True). For example 2, when querying
    # Strain, we prepend 'line__' and get Q(line__active=True)
    query_keyword = '%sactive' % query_prefix
    # return requested status, or active objects only if input was bad
    active_value = (active_status != QUERY_INACTIVE_OBJECTS_ONLY)
    # TODO: remove debug stmt
    print('Active query %s' % str({query_keyword: active_value}))
    active_criterion = Q(**{query_keyword: active_value})
    return queryset.filter(active_criterion)


class StudyViewSet(viewsets.ReadOnlyModelViewSet):  # read-only for now...see TODO below
    """
    API endpoint that provides read-only access to studies, subject to user/role read access
    controls. Study write access is a TODO.
    """
    serializer_class = StudySerializer
    contact = StringRelatedField(many=False)

    def get_queryset(self):

        user = self.request.user

        permission = StudyPermission.READ
        if self.request.method in HTTP_MUTATOR_METHODS:
            permission = StudyPermission.WRITE

        # if the user's admin / staff role gives read access to all Studies, don't bother querying
        # the database for specific permissions defined on this study
        if permission == StudyPermission.READ and Study.user_role_can_read(user):
            logger.debug('User role has study read permission')
            study_query = Study.objects.all()
        else:
            logger.debug('Searching for studies user %s has read access to.' % user.username)
            user_permission_q = Study.user_permission_q(user, permission)
            # NOTE: distinct is required since this query can return multiple rows for the same
            # study, one per permission that gives this user access to it
            study_query = Study.objects.filter(user_permission_q).distinct()

        # if client provided a study ID, filter based on it
        # TODO: nice-to-have UUID / slug based lookup drafted here isn't working, but log statements
        # inserted here imply that the logic is correct/similar queries work from the command line.
        # circle back to this and to any other related code when revisiting the REST
        # API...
        # TODO: misleading 'pk' kwarg is set by router...investigate later.
        study_id = self.kwargs.get('pk', None)
        if study_id:
            # test whether this is an integer pk
            found_identifier_format = False
            try:
                study_query = study_query.filter(pk=int(study_id))
                found_identifier_format = True
            except ValueError:
                logger.debug('Study identifier "%s" is not an integer pk' % study_id)

            # if format not found, try UUID
            if not found_identifier_format:
                try:
                    logger.debug('Trying UUID %s' % study_id)
                    study_query = study_query.filter(uuid=UUID(study_id))
                    found_identifier_format = True
                except ValueError:
                    logger.debug('Study identifier "%s" is not a UUID' % study_id)

            # otherwise assume it's a slug
            if not found_identifier_format:
                logger.debug('Treating identifier "%s" as a slug' % study_id)
                study_query = study_query.filter(slug=study_id)

        study_query = _optional_timestamp_filter(study_query,
                                                 self.request.query_params)

        return study_query

    def create(self, request, *args, **kwargs):
        if not Study.user_can_create(request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        return super(StudyViewSet, self).create(request, *args, **kwargs)

    # TODO: test whether update / destroy are protected by get_queryset, or whether they need
        # separate permissions checks to protect them. Then change back to a ModelViewSet.


NUMERIC_PK_PATTERN = re.compile('^\d+$')

# Notes on DRF nested views:
# lookup_url_kwargs doesn't seem to be used/respected by nested routers in the same way as plain
# DRF - see StrainStudiesView for an example that works, but isn't clearly the most clear yet


class StrainStudiesView(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows read-only access to the studies a given strain is used in (subject to
    user/role read access privileges on the studies).
    """
    serializer_class = StudySerializer
    lookup_url_kwarg = 'study_pk'

    def get_object(self):
        """
        Overrides the default implementation to provide flexible lookup for nested strain
        views (either based on local numeric primary key, or based on the strain UUID from ICE
        """
        # unlike the example, just do all the filtering in get_queryset() for consistency
        filters = {}
        queryset = self.get_queryset()

        obj = get_object_or_404(queryset, **filters)
        # verify class-level strain access. study permissions are enforced in get_queryset()
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        kwarg = '%s_%s' % (STRAIN_NESTED_RESOURCE_PARENT_PREFIX, BASE_STRAIN_URL_KWARG)
        # get the strain identifier, which could be either a numeric (local) primary key, or a UUID
        strain_id = self.kwargs.get(kwarg)

        # figure out which it is
        strain_pk = strain_id if is_numeric_pk(strain_id) else None
        strain_uuid = strain_id if not strain_pk else None

        params = self.request.query_params

        line_active_status = self.request.query_params.get(
            LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT
        )
        user = self.request.user

        # only allow superusers through, since this is strain-related data that should only be
        # accessible to sysadmins. Also allows us to potentially avoid expensive joins to check for
        # per-study user/group permissions (though we've included below for the moment for safety)
        if not user.is_superuser:
            #  TODO: user group / merge in recent changes / throw PermissionsError or whatever
            return Response(status=status.HTTP_403_FORBIDDEN)

        study_pks_query = None
        if strain_pk:
            study_pks_query = Line.objects.filter(strains__pk=strain_pk)
        else:
            study_pks_query = Line.objects.filter(strains__registry_id=strain_uuid)
        study_pks_query = filter_by_active_status(
                study_pks_query, active_status=line_active_status).values_list(
                'study__pk').distinct()  # distict() needed bc of line active status filtering
        studies_query = Study.objects.filter(pk__in=study_pks_query)

        study_pk = self.kwargs.get(self.lookup_url_kwarg)
        if study_pk:
            studies_query = studies_query.filter(pk=study_pk)

        studies_query = _optional_timestamp_filter(studies_query, params)

        # enforce EDD's custom access controls for readability of the associated studies. Note:
        # at present this isn't strictly necessary because of the sysadmin check above but best
        # to enforce programatically in case the implementation of Study's access controls
        # changes later on
        if not Study.user_role_can_read(user):
            study_user_permission_q = Study.user_permission_q(user, StudyPermission.READ,
                                                              keyword_prefix='line__study__')
            studies_query = studies_query.filter(study_user_permission_q)
        # required by both line activity and studies permissions queries
        studies_query = studies_query.distinct()

        return studies_query


class StudyStrainsView(viewsets.ReadOnlyModelViewSet):
    """
        API endpoint that allows read-only viewing the unique strains used within a specific study
    """
    serializer_class = StrainSerializer
    STUDY_URL_KWARG = 'study_pk'
    STRAIN_URL_KWARG = 'pk'

    # override

    def get_object(self):
        """
            Overrides the default implementation to provide flexible lookup for nested strain
            views (either based on local numeric primary key, or based on the strain UUID from ICE
            """
        filters = {}  # unlike the example, just do all the filtering in get_queryset() for
        # consistency
        queryset = self.get_queryset()
        obj = get_object_or_404(queryset, **filters)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        print(self.kwargs)

        # extract URL arguments
        study_id = self.kwargs[self.STUDY_URL_KWARG]

        study_id_is_pk = is_numeric_pk(study_id)
        line_active_status = self.request.query_params.get(LINE_ACTIVE_STATUS_PARAM,
                                                           LINES_ACTIVE_DEFAULT)
        user = self.request.user

        # build the query, enforcing EDD's custom study access controls. Normally we'd require
        # sysadmin access to view strains, but the names/descriptions of strains in the study
        # should be visible to users with read access to a study that measures them
        study_user_permission_q = Study.user_permission_q(user, StudyPermission.READ,
                                                          keyword_prefix='line__study__')
        if study_id_is_pk:
            strain_query = Strain.objects.filter(study_user_permission_q, line__study__pk=study_id)
        else:
            logger.error("Non-numeric study IDs aren't supported.")
            return Strain.objects.none()

        strain_id = self.kwargs.get(self.STRAIN_URL_KWARG)
        if strain_id:
            strain_id_is_pk = is_numeric_pk(strain_id)

            if strain_id_is_pk:
                strain_query = strain_query.filter(pk=strain_id)
            else:
                strain_query = strain_query.filter(registry_id=strain_id)

        # filter by line active status, applying the default (only active lines)
        strain_query = filter_by_active_status(strain_query, line_active_status,
                                               query_prefix='line__')
        # required by both study permission query and line active filters above
        strain_query = strain_query.distinct()

        return strain_query


class StudyLineView(viewsets.ModelViewSet):  # LineView(APIView):
    """
        API endpoint that allows lines within a study to be searched, viewed, and edited.
    """
    serializer_class = LineSerializer
    STUDY_URL_KWARG = 'study_pk'

    def get_queryset(self):
        # extract study pk URL argument. line pk, if present, will be handled automatically by
        # get_object() inherited from the parent class
        study_pk = self.kwargs[self.STUDY_URL_KWARG]

        user = self.request.user
        requested_permission = (StudyPermission.WRITE if self.request.method in
                                HTTP_MUTATOR_METHODS else StudyPermission.READ)

        # if the user's admin / staff role gives read access to all Studies, don't bother querying
        # the database for specific permissions defined on this study
        if requested_permission == StudyPermission.READ and Study.user_role_can_read(user):
            line_query = Line.objects.filter(study__pk=study_pk)
        else:
            study_user_permission_q = Study.user_permission_q(user, requested_permission,
                                                              keyword_prefix='study__')
            line_query = Line.objects.filter(study_user_permission_q, study__pk=study_pk)

        query_params = self.request.query_params

        line_query = _optional_regex_filter(query_params, line_query, 'name',
                                            STUDY_LINE_NAME_REGEX, None, )

        line_query = _optional_timestamp_filter(line_query, query_params)

        # filter by line active status, applying the default (only active lines)
        line_active_status = self.request.query_params.get(LINE_ACTIVE_STATUS_PARAM,
                                                           LINES_ACTIVE_DEFAULT)
        line_query = filter_by_active_status(line_query, line_active_status)
        # distinct() required by *both* study permissions check and line activity filter above
        line_query = line_query.distinct()

        return line_query

    def create(self, request, *args, **kwargs):
        ##############################################################
        # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        StudyLineView._test_user_write_access(user, study_pk)
        # if user has write privileges for the study, use parent implementation
        return super(StudyLineView, self).create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        ##############################################################
        # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        StudyLineView._test_user_write_access(user, study_pk)
        # if user has write privileges for the study, use parent implementation
        return super(StudyLineView, self).update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        ##############################################################
        # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        StudyLineView._test_user_write_access(user, study_pk)
        # if user has write privileges for the study, use parent implementation
        return super(StudyLineView, self).destroy(request, *args, **kwargs)

    @staticmethod
    def _test_user_write_access(user, study_pk):
        # return a 403 error if user doesn't have write access
        try:
            study = Study.objects.get(pk=study_pk)
            if study.user_can_write(user):
                return None
        except Study.DoesNotExist as e:
            logger.warning('Got request to modify non-existent study %s', study_pk)
        raise PermissionDenied()


class NotImplementedException(APIException):
    status_code = 500
    default_detail = 'Not yet implemented'


def _optional_timestamp_filter(queryset, query_params):
    """
    For any EddObject-derived model object, creates and returns an updated queryset that's
    optionally filtered by creation or update timestamp. Note that in both cases the start bound
    is inclusive and the end is exclusive.
    @:raise ParseError if the one of the related query parameters was provided, but was
    improperly formatted
    """
    query_param_name, value = None, None
    try:
        # filter by creation timestamp
        created_after_value = query_params.get(CREATED_AFTER_PARAM, None)
        created_before_value = query_params.get(CREATED_BEFORE_PARAM, None)
        if created_after_value:
            query_param_name, value = CREATED_AFTER_PARAM, created_after_value
            queryset = queryset.filter(created__mod_time__gte=created_after_value)
        if created_before_value:
            query_param_name, value = CREATED_BEFORE_PARAM, created_before_value
            queryset = queryset.filter(created__mod_time__lt=created_before_value)

        # filter by last update timestamp
        updated_before = query_params.get(UPDATED_BEFORE_PARAM, None)
        updated_after = query_params.get(UPDATED_AFTER_PARAM, None)
        if updated_after:
            query_param_name, value = UPDATED_AFTER_PARAM, updated_after
            queryset = queryset.filter(updated__mod_time__gte=updated_after)
        if updated_before:
            query_param_name, value = UPDATED_BEFORE_PARAM, updated_before
            queryset = queryset.filter(updated__mod_time__lt=updated_before)

    # if user provided a date in a format Django doesn't understand,
    # re-raise in a way that makes the client error apparent
    except TypeError as te:
        raise ParseError(detail='%(param)s %(value)s is not a valid date/time.' % {
            'param': query_param_name,
            'value': value,
        })

    return queryset
