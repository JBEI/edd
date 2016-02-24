"""
Defines serializers for EDD's nascent REST API, as supported by the django rest framework
(http://www.django-rest-framework.org/)
"""

from rest_framework import serializers
from rest_framework import reverse
from main.models import Line, Study, User, Strain, Update
from rest_framework.fields import empty

####################################################################################################
# unused
####################################################################################################
class UpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Update
        fields = ('mod_time', 'mod_by', 'path', 'origin')
        depth = 0

####################################################################################################

class StudySerializer(serializers.ModelSerializer):
    class Meta:
        model = Study
        fields = ('pk', 'name', 'description', 'created', 'updated', 'contact', 'contact_extra',
                                                                               'metabolic_map',
                  'meta_store')
        # here after
        # confirming that Lines (our primary concern at the moment) work
        depth = 0
        lookup_field = 'study'

# a custom HyperLinkedRelatedField to allow study-related Lines to be accessed from
# /rest/study/<study_pk>/lines/<line_pk>/. HyperLinkedRelatedFields, including those generated by
# the much simpler ModelSerializer implementation, only allows for a single primary key to be
# present in the URL, as evinced by server-side error messages like "TypeError: put() got an
# unexpected keyword argument 'study'"
class StudyLineRelatedField(serializers.HyperlinkedRelatedField):
    #view_name='StudyLine'
    view_name='StudyListLinesView-list'
    lookup_field = 'study'

    def get_url(self, line, view_name, request, format):
        url_kwargs = {
            'study': line.study_id,
            'line': line.object_ref_id,
        }
        return reverse(view_name, kwargs=url_kwargs, request=request, format=format)

    def get_object(self, view_name, view_args, view_kwargs):
        lookup_kwargs = {
            'study': view_kwargs['study'],
            'line': view_kwargs['line']
        }
        return self.get_queryset().get(**lookup_kwargs)

    def get_queryset(self):
        return Line.objects.get(pk=self.kwargs['study'], study__pk=self.kwargs['study'])


class LineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Line
        # Note: display only a subset of the fields
        # TODO: follow up on contact extra field -- can't be null/blank, but appears unused in GUI
        fields = ('pk', 'study', 'name', 'description', 'control', 'replicate', 'contact',
                    'experimenter', 'protocols', 'strains',)

        #study = StudyLineRelatedField(many=False, read_only=True)
        #contact = serializers.StringRelatedField(many=False)
        carbon_source = serializers.StringRelatedField(many=False)
        #strains = serializers.StringRelatedField(many=True, read_only=True)
        depth = 0

        def create(self, validated_data):
            """
            Create and return a new Line instance, given the validated data
            """
            return Line.objects.create(**validated_data)

        def update(self, validated_data):
            """
            Update and return an existing Line instance, given the validated new values
            """

class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        depth = 0

class StrainSerializer(serializers.ModelSerializer):

    class Meta:
        model = Strain

        fields = ('name', 'description', 'registry_url', 'registry_id', 'pk')
        depth = 0

    # def __init__(self, instance=None, data=empty, **kwargs):
    #      super(self.__class__, self).__init__(instance, data, **kwargs)

    # work around an apparent oversite in ModelSerializer's __new__ implementation that prevents us
    # from using it to construct new objects from a class instance with kw arguments similar to its
    # __init__() method
    # @staticmethod
    # def __new__(cls, *args, **kwargs):
    #     kwargs.pop('data', empty)
    #     kwargs.pop('instance', None)
    #     return serializers.ModelSerializer.__new__(cls, *args, **kwargs)
