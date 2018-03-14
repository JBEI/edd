# coding: utf-8
"""
A manage.py command used to load in optional bootstrap data to an EDD installation. The fixtures
begin at ID 1; this command will shift the IDs to start after the highest existing ID.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import DEFAULT_DB_ALIAS, transaction
from django.db.models import Max

from main import models


class Command(BaseCommand):
    help = 'Installs bootstrap fixtures in the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--database',
            action='store',
            dest='database',
            default=DEFAULT_DB_ALIAS,
            help='Nominates a specific database to load fixtures into. Defaults to the '
                 '"default" database.'
        )

    def handle(self, *args, **kwargs):
        self.using = kwargs.get('database')
        self._load_proteins()
        self._load_metabolites()

    def _load_metabolites(self):
        with transaction.atomic(using=self.using):
            # Replace PK to_python methods
            metabolite_pk = models.Metabolite._meta.pk
            type_pk = models.MeasurementType._meta.pk
            metabolite_tp = metabolite_pk.to_python
            type_tp = type_pk.to_python
            type_objects = models.MeasurementType.objects.using(self.using)
            max_value = type_objects.aggregate(max=Max('pk'))['max']
            metabolite_pk.to_python = lambda v: max_value + metabolite_tp(v)
            type_pk.to_python = lambda v: max_value + type_tp(v)
            # Import the fixture data
            call_command(
                'loaddata',
                'bootstrap-metabolite.json',
                app_label='main',
                database=self.using
            )
            # Restore PK to_python methods
            metabolite_pk.to_python = metabolite_tp
            type_pk.to_python = type_tp

    def _load_proteins(self):
        with transaction.atomic(using=self.using):
            # Replace PK to_python methods
            protein_pk = models.ProteinIdentifier._meta.pk
            type_pk = models.MeasurementType._meta.pk
            protein_tp = protein_pk.to_python
            type_tp = type_pk.to_python
            type_objects = models.MeasurementType.objects.using(self.using)
            max_value = type_objects.aggregate(max=Max('pk'))['max']
            protein_pk.to_python = lambda v: max_value + protein_tp(v)
            type_pk.to_python = lambda v: max_value + type_tp(v)
            # Import the fixture data
            call_command(
                'loaddata',
                'bootstrap-proteins.json',
                app_label='main',
                database=self.using
            )
            # Restore PK to_python methods
            protein_pk.to_python = protein_tp
            type_pk.to_python = type_tp
