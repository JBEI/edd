from rest_framework.generics import GenericAPIView
from rest_framework.relations import StringRelatedField

from main.models import Study, StudyPermission, Line, Strain, User
from rest_framework import viewsets
from rest_framework import mixins
from rest_framework.views import APIView
from .serializers import LineSerializer, StudySerializer, UserSerializer, StrainSerializer
import logging
from rest_framework.exceptions import APIException
from rest_framework import permissions
from rest_framework.response import Response
logger = logging.getLogger(__name__)
from rest_framework import permissions
from rest_framework import status
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from django.shortcuts import get_object_or_404


from django.http import Http404

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
        # parse optional query parameters

        id = self.request.query_params.get('id')
        url = self.request.query_params.get('url')
        name = self.request.query_params.get('name')
        name_regex = self.request.query_params.get('name_regex')

        query = Strain.objects.all()
        if id:
            query = query.filter(registry_id=id)
        if url:
            query = query.filter(registry_url=url)
        if name:
            query = query.filter(name__icontains=name)
        if name_regex:
            query = query.filter(name__iregex=name_regex)

        return query

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

        # if the user's admin / staff role gives read access to all Studies, don't bother testing
        # the explicit permissions for this study in the query
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
        requested_permission = StudyPermission.WRITE if self.request.method in HTTP_MUTATOR_METHODS else \
                     StudyPermission.READ

        # build the query, enforcing EDD's custom study access controls # TODO: initial code here
        # doesn't test for write permissions. should be able to handle that

        if requested_permission == StudyPermission.READ or Study.user_can_read(user):
            study_user_permission_q = Study.user_permission_q(user, requested_permission,
                                                              keyword_prefix='study__')
            line_query = Line.objects.filter(study_user_permission_q,
                                             study__pk=study_pk)
        else:
            line_query = Line.objects.filter(study__pk=study_pk)

        return line_query

    #def post(self, request):

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