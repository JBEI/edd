# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Factory classes used to generate objects under test.
"""

import factory

from django.contrib.auth import get_user_model

from .. import models


class StudyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Study
    name = factory.Faker('catch_phrase')
    description = factory.Faker('text', max_nb_chars=300)
    contact_extra = ''


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
    username = factory.Sequence(lambda n: 'user%03d' % n)  # username is unique
