# -*- coding: utf-8 -*-
from __future__ import absolute_import, unicode_literals

import django.dispatch

study_modified = django.dispatch.Signal(providing_args=['study', 'using'])
study_removed = django.dispatch.Signal(providing_args=['doc', 'using'])
type_modified = django.dispatch.Signal(providing_args=['measurement_type', 'using'])
type_removed = django.dispatch.Signal(providing_args=['doc', 'using'])
user_modified = django.dispatch.Signal(providing_args=['user', 'using'])
user_removed = django.dispatch.Signal(providing_args=['doc', 'using'])

from . import core, permission, sbml, solr, user  # noqa
