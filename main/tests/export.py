# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import factory

from django.test import TestCase

from .. import models


class SbmlTemplateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.SBMLTemplate


class SbmlBuilderTests(TestCase):
    def setUp(self):
        pass
