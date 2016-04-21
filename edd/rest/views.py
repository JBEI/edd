"""
Defines the supported views for EDD's REST framework. This class is a work in progress.

Assuming Django REST Framework (DRF) will be adopted in EDD, new and existing views should be
ported to this class over time. Many REST resources are currently defined in main/views.py,
but are not making use of DRF.
"""
import re

from django.db.models import Q
from django.shortcuts import get_object_or_404
from edd.rest.serializers import LineSerializer, StudySerializer, UserSerializer, StrainSerializer
from jbei.edd.rest.edd import LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT, ACTIVE_LINES_ONLY, \
    ALL_LINES_VALUE, INACTIVE_LINES_ONLY
from main.models import Study, StudyPermission, Line, Strain, User
from rest_framework import (mixins, permissions, status, viewsets)
from rest_framework.generics import ListAPIView
from rest_framework.exceptions import APIException
from rest_framework.relations import StringRelatedField
from rest_framework.response import Response

import logging

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

STUDY_URL_KWARG='study'
HTTP_MUTATOR_METHODS = ('POST', 'PUT', 'PATCH', 'UPDATE', 'DELETE')


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    def get_queryset(self):
        return User.objects.filter(self.kwargs['user'])

class StrainViewSet(viewsets.ModelViewSet):
    serializer_class = StrainSerializer
    # TODO: we probably shouldn't expose strains that the user doesn't have view access to in ICE?
    #  / EDD

    def get_queryset(self):
        logger.debug('in %s' % self.get_queryset.__name__)
        # parse optional query parameters

        pk_filter = self.request.query_params.get('pk')
        registry_id_filter = self.request.query_params.get('registry_id')
        registry_url_regex_filter = self.request.query_params.get('registry_url_regex')
        case_sensitive = self.request.query_params.get('case_sensitive')
        name_filter = self.request.query_params.get('name')
        name_regex_filter = self.request.query_params.get('name_regex')

        query = Strain.objects.all()

        if pk_filter:
            query = query.filter(pk=pk_filter)

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

        if name_regex_filter:
            if case_sensitive:
                query = query.filter(name__regex=name_regex_filter)
            else:
                query = query.filter(name__iregex=name_regex_filter)

        query = query.select_related('object_ref')

        print('StrainViewSet query count=%d' % query.count())
        print(query)

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
        active_status = self.kwargs.get(LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT)
        query = filter_line_activity(query, active_status)
        return query


def filter_line_activity(query, line_active_status=ACTIVE_LINES_ONLY, query_prefix=''):
    """
    Filters the input query by line active status. Note that this filtering by line active status
    will return one row for each line active relationship to the input query, so clients will often
    want to use distinct() to limit the returned results
    :param query: the base query
    :param line_active_status: a string with the line active status. If this isn't one of the
    recognized values, the default behavior is applied, filtering out inactive lines
    :param query_prefix: an optional keyword prefix to prepend to the filtering query keyword
    arguments. For example when querying Line, the default value of '' should by used,
    or when querying for Study, use 'study__' similar to other queryset keyword arguments.
    :return: the input query, filtered according to the parameters
    """
    line_active_status = line_active_status.lower()

    if ALL_LINES_VALUE:
        return query

    # return requested status, or active lines only if input was bad
    active_criterion = Q(**{'%sactive' % query_prefix: (line_active_status != INACTIVE_LINES_ONLY)})
    return query.filter(active_criterion)


class StudyViewSet(viewsets.ReadOnlyModelViewSet):  # read-only for now...see TODO below
    serializer_class = StudySerializer
    contact = StringRelatedField(many=False)

    def get_queryset(self):
        study_pk = self.kwargs.get('pk')

        user = self.request.user

        permission = StudyPermission.WRITE if self.request.method in HTTP_MUTATOR_METHODS else \
                     StudyPermission.READ

        # if the user's admin / staff role gives read access to all Studies, don't bother querying
        # the database for specific permissions defined on this study
        if permission == StudyPermission.READ and Study.user_role_can_read(user):
            study_query = Study.objects.filter(pk=study_pk)
        else:
            user_permission_q = Study.user_permission_q(user, permission)
            # NOTE: distinct is required since this query can return multiple rows for the same
            # study, one per permission that gives this user access to it
            study_query = Study.objects.filter(user_permission_q, pk=study_pk).distinct()

        return study_query

    def create(self, request, *args, **kwargs):
        if not Study.user_can_create(request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        return super(StudyViewSet, self).create(request, *args, **kwargs)

    # TODO: test whether update / destroy are protected by get_queryset, or whether they need
        # separate permissions checks to protect them. Then change back to a ModelViewSet.


NUMERIC_PK_PATTERN = re.compile('^\d+$')
STRAIN_LOOKUP = 'strain_id'


class StrainStudiesView(viewsets.ReadOnlyModelViewSet):
    serializer_class = StudySerializer

    def get_queryset(self):
        # get the strain identifier, which could be either a numeric (local) primary key, or a UUID
        strain_id = self.kwargs.get('strain_pk')  # NOTE: couldn't easily find a way to change
        # lookup_field for nested router based resource like this.

        # figure out which it is
        strain_pk = strain_id if NUMERIC_PK_PATTERN.match(strain_id) else None
        strain_uuid = strain_id if not strain_pk else None

        line_active_status = self.kwargs.get(LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT)
        user = self.request.user

        # only allow superusers through, since this is strain-related data that should only be
        # accessable to sysadmins
        if not user.is_superuser:
            #  TODO: user group / merge in recent changes / throw PermissionsError or whatever
            return Response(status=status.HTTP_403_FORBIDDEN)

        studies_query = None
        if strain_pk:
            studies_query = Study.objects.filter(line__strains__pk=strain_pk)
        else:
            studies_query = Study.objects.filter(line__strains__registry_id=strain_uuid)

        # filter by line active status, applying the default (only active lines)
        studies_query = filter_line_activity(studies_query, line_active_status=line_active_status,
                             query_prefix='line__')

        # enforce EDD's custom access controls for readability of the associated studies. Note:
        # at present this isn't strictly necessary because of the sysadmin check above but best
        # to enforce programatically in case the implementation of Study's access controls
        # changes later on

        if not Study.user_role_can_read(user):
            study_user_permission_q = Study.user_permission_q(user, StudyPermission.READ,
                                                              keyword_prefix='line__study__')
            studies_query = studies_query.filter(study_user_permission_q)

        studies_query = studies_query.distinct()  # required by both line activity and studies
                                                  # permissions queries

        return studies_query


class StudyStrainsView(viewsets.ReadOnlyModelViewSet):
    """
        API endpoint that allows viewing the unique strains used within a specific study
    """
    serializer_class = StrainSerializer
    STUDY_URL_KWARG = 'study_pk'

    def get_queryset(self):
        print(self.kwargs)

        # extract URL arguments
        study_id = self.kwargs[self.STUDY_URL_KWARG]
        study_id_is_pk = re.match('^\d+$', study_id)
        line_active_status = self.kwargs.get(LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT)

        user = self.request.user

        # build the query, enforcing EDD's custom study access controls. Normally we'd require
        # sysadmin access to view strains, but the names/descriptions of strains in the study should
        # be visible to users with read access to a study that measures them
        study_user_permission_q = Study.user_permission_q(user, StudyPermission.READ,
                                                              keyword_prefix='line__study__')

        if study_id_is_pk:
            strain_query = Strain.objects.filter(study_user_permission_q, line__study__pk=study_id)
        else:
            strain_query = Strain.objects.filter(study_user_permission_q,
                                                line__study_registry_id=study_id)

        # filter by line active status, applying the default (only active lines)
        strain_query = filter_line_activity(strain_query, line_active_status, query_prefix='line__')
        strain_query = strain_query.distinct()  # required by both study permission query and
                                                # line activity filter queries above

        return strain_query


class StudyLineView(viewsets.ModelViewSet):  # LineView(APIView):
    """
        API endpoint that allows lines to be viewed or edited.
    """
    serializer_class = LineSerializer
    LINE_URL_KWARG = "line"
    STUDY_URL_KWARG = 'study_pk'

    def get_queryset(self):
        print(self.kwargs)

        # extract URL arguments
        #line_pk = self.kwargs[self.LINE_URL_KWARG]
        study_pk = self.kwargs[self.STUDY_URL_KWARG]

        line_active_status = self.kwargs.get(LINE_ACTIVE_STATUS_PARAM, LINES_ACTIVE_DEFAULT)

        user = self.request.user
        requested_permission = StudyPermission.WRITE if self.request.method in \
                               HTTP_MUTATOR_METHODS else StudyPermission.READ

        # build the query, enforcing EDD's custom study access controls
        if requested_permission == StudyPermission.READ or Study.user_can_read(user):
            study_user_permission_q = Study.user_permission_q(user, requested_permission,
                                                              keyword_prefix='study__')
            line_query = Line.objects.filter(study_user_permission_q,
                                             study__pk=study_pk)
        else:
            line_query = Line.objects.filter(study__pk=study_pk)

        # filter by line active status, applying the default (only active lines)
        line_query = filter_line_activity(line_query, line_active_status)

        line_query = line_query.distinct()  # distinct required by both study permissions check
                                            # and line activity filter above

        return line_query

    # TODO: if doable with some degree of clarity, use reflection to enforce DRY in mutator methods
    # below. For now, we'll go with fast rather than elegant. MF 2/24/16
    # def enforce_write_access_privileges(self, call_on_success_function):
    #     study_pk = self.kwargs[self.STUDY_URL_KWARG]
    #     user = self.request.user
    #
    #     if self.queryset:
    #         logger.log('has queryset')
    #
    #     # enforce study write privileges
    #     error_response = StudyLineView._test_user_write_access(user, study_pk)
    #     if error_response:
    #         return error_response
    #
    #     super(StudyLineView).call_on_success_function(self, ) # TODO: investigate this

    def create(self, request, *args, **kwargs):
        ##############################################################
         # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        error_response = StudyLineView._test_user_write_access(user, study_pk)
        if error_response:
            return error_response

        ##############################################################
        # if user has write privileges for the study, use parent implementation
        ##############################################################
        return super(StudyLineView, self).create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        ##############################################################
         # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        error_response = StudyLineView._test_user_write_access(user, study_pk)
        if error_response:
            return error_response

        ##############################################################
        # if user has write privileges for the study, use parent implementation
        ##############################################################
        return super(StudyLineView, self).update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        ##############################################################
         # enforce study write privileges
        ##############################################################
        study_pk = self.kwargs[self.STUDY_URL_KWARG]
        user = self.request.user
        error_response = StudyLineView._test_user_write_access(user, study_pk)
        if error_response:
            return error_response

        ##############################################################
        # if user has write privileges for the study, use parent implementation
        ##############################################################
        return super(StudyLineView, self).destroy(request, *args, **kwargs)


    @staticmethod
    def _test_user_write_access(user, study_pk):
        # return a 403 error if user doesn't have write access
        requested_permission = StudyPermission.WRITE
        study_user_permission_q = Study.user_permission_q(user, requested_permission)
        user_has_permission_query = Study.objects.filter(study_user_permission_q,
                                                         pk=study_pk).distinct()

        # TODO: test raising PermissionDenied() similar to Django

        if not user_has_permission_query:
            return Response(status=status.HTTP_403_FORBIDDEN)

        return None


    #

    # def put(self, request, format=None):
    #     logger.error("in put()")
    #     study_pk = self.kwargs.get(self.STUDY_URL_KWARG)
    #     study = Study.objects.get(pk=study_pk)
    #     if not (study and study.user_can_read(request.user)):
    #         return Response(status=status.HTTP_400_BAD_REQUEST)
    #
    #     serializer = LineSerializer(data=request.data)
    #     if serializer.is_valid():
    #         serializer.save()
    #         return Response(serializer.data, stutus=status.HTTP_201_CREATED)
    #
    #     return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class StrainsView(viewsets.ModelViewSet): # TODO: unused...implement
    serializer_class = StrainSerializer
    lookup_field = 'pk'

class StudyListLinesView(mixins.CreateModelMixin, ListAPIView):  # TODO: unused... implement or
                                                                 # remove
    """
        API endpoint that allows lines to be viewed or edited.
    """

    serializer_class = LineSerializer
    lookup_field = 'pk'

    STUDY_URL_KWARG = "study"
    LINE_URL_KWARG = "line"

    #lookup_field =

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        filter['study__pk'] = self.kwargs[self.lookup_field]

        if self.LINE_URL_KWARG in self.kwargs:
            filter['pk'] = self.kwargs[self.LINE_URL_KWARG]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):

        # extract URL arguments
        line_pk = self.kwargs.get(self.LINE_URL_KWARG) if self.LINE_URL_KWARG in self.kwargs else\
            None
        study_pk = self.kwargs.get(self.STUDY_URL_KWARG)

        user = self.request.user

        # if no line primary key was provided, get all the lines associated with this study
        if not line_pk:
            all_lines_queryset = Line.objects.filter(study__pk=study_pk).prefetch_related(
                    'study') # study determines line access permissions for included lines

            if all_lines_queryset and all_lines_queryset.first().user_can_read(user):
                return all_lines_queryset

            return Line.objects.none()

        # a line pk was provided, so get just the requested line

        # build the query
        line_query = Line.objects.filter(pk=line_pk,study__pk=study_pk).prefetch_related(
                'study') # study determines line access permissions for included lines

        # only return the result if the line exists AND the
        # user has read permissions to the associated study
        if line_query and line_query.get().user_can_read(user):
            return line_query

        return Line.objects.none()

    def get(self, request, args, kwargs):
        return self.list(request, args, kwargs)

    def post(self, request, args, kwargs):
        return self.create(request, args, kwargs)

    # def post(self, request, format=None):
    #     logger.error("in put()")
    #     study_pk = self.kwargs.get(self.STUDY_URL_KWARG)
    #     study = Study.objects.get(pk=study_pk)
    #     if not (study and study.user_can_read(request.user)):
    #         return Response(status=status.HTTP_400_BAD_REQUEST)
    #
    #     serializer = LineSerializer(data=request.data)
    #     if serializer.is_valid():
    #         serializer.save()
    #         return Response(serializer.data, stutus=status.HTTP_201_CREATED)
    #
    #     return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NotImplementedException(APIException):
    status_code = 500
    default_detail = 'Not yet implemented'