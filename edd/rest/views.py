import logging

from rest_framework import mixins, status
from rest_framework import viewsets
from rest_framework.exceptions import APIException
from rest_framework.relations import StringRelatedField
from rest_framework.response import Response

from edd.rest.serializers import LineSerializer, StudySerializer, UserSerializer, StrainSerializer
from main.models import Study, StudyPermission, Line, Strain, User

logger = logging.getLogger(__name__)
from rest_framework import permissions
from rest_framework.generics import ListAPIView
from django.shortcuts import get_object_or_404

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

    # def list(self):
    #     logger.debug('in ' + self.list.__name__())
    #     super.list()
    #
    # def retrieve(self, request, *args, **kwargs):
    #     logger.debug('in ' + self.list.__name__())
    #     super.retrieve(request, *args, **kwargs)
    #
    def create(self, request, *args, **kwargs):
         logger.debug('in ' + self.list.__name__)

         # deny access to those without permission
         user = request.user
         if not Strain.user_can_write(user):
             return Response(status=status.HTTP_403_FORBIDDEN)

         return super(StrainViewSet, self).create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        logger.debug('in ' + self.list.__name__)

        # deny access to those without permission
        user = request.user
        if not Strain.user_can_write(user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        return super(StrainViewSet, self).update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
         logger.debug('in ' + self.list.__name__)

         # deny access to those without permission
         user = request.user
         if not Strain.user_can_write(user):
             return Response(status=status.HTTP_403_FORBIDDEN)

         return super(StrainViewSet, self).destroy(request, *args, **kwargs)


class LineViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Lines to we viewed or edited.
    """
    queryset = Line.objects.all().order_by('created')
    serializer_class = LineSerializer
    contact = StringRelatedField(many=False)
    experimenter = StringRelatedField(many=False)


class StudyViewSet(viewsets.ModelViewSet):
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
            study_query = Study.objects.filter(user_permission_q, pk=study_pk)

        return study_query


class StudyLineView(viewsets.ModelViewSet):  # LineView(APIView):
    serializer_class = LineSerializer
    permission_classes = [permissions.IsAuthenticated]
    LINE_URL_KWARG = "line"
    STUDY_URL_KWARG = 'study_pk'

    """
    API endpoint that allows lines to be viewed or edited.
    """

    def get_queryset(self):
        print(self.kwargs)

        # extract URL arguments
        #line_pk = self.kwargs[self.LINE_URL_KWARG]
        study_pk = self.kwargs[self.STUDY_URL_KWARG]

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
        return super(StudyLineView, self).create(request, *args, **kwargs)


    @staticmethod
    def _test_user_write_access(user, study_pk):
        # return a 403 error if user doesn't have write access
        requested_permission = StudyPermission.WRITE
        study_user_permission_q = Study.user_permission_q(user, requested_permission)
        user_has_permission_query = Study.objects.filter(study_user_permission_q, pk=study_pk)

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

class StrainsView(viewsets.ModelViewSet):
    serializer_class = StrainSerializer
    lookup_field = 'pk'

class StudyListLinesView(mixins.CreateModelMixin, ListAPIView):
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

    """
    API endpoint that allows lines to be viewed or edited.
    """

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