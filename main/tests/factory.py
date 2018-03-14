# coding: utf-8
"""
Factory classes used to generate objects under test.
"""

import environ
import factory

from django.contrib.auth import get_user_model

from .. import models


def load_test_file(name):
    "Opens test files saved in the `files` directory."
    cwd = environ.Path(__file__) - 1
    filepath = cwd('files', name)
    return open(filepath, 'rb')


class StudyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Study
    name = factory.Faker('catch_phrase')
    description = factory.Faker('text', max_nb_chars=300)
    contact_extra = ''


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
    username = factory.Faker('user_name')
    email = factory.Faker('safe_email')
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
