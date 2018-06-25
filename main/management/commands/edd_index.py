# coding: utf-8
"""
Populate the Solr indexes used by EDD.
"""

from django.core.management.base import BaseCommand
from django_auth_ldap.backend import LDAPBackend, _LDAPUser

from main import solr


class Command(BaseCommand):
    help = 'Ensures the Solr indexes are ready for EDD to use.'

    backend = LDAPBackend()
    study_core = solr.StudySearch()
    user_core = solr.UserSearch()
    measurement_core = solr.MeasurementTypeSearch()

    def __init__(self, *args, **kwargs):
        super(Command, self).__init__(*args, **kwargs)

    def add_arguments(self, parser):
        # Add all parent arguments
        super(Command, self).add_arguments(parser)
        parser.add_argument(
            '--force',
            action='store_true',
            default=False,
            dest='force',
            help='Forces a re-index',
        )

    def handle(self, *args, **options):
        self.stdout.write("Checking user index")
        if options['force'] or len(self.user_core) == 0:
            users_qs = self.user_core.get_queryset()
            self.user_core.swap().clear()
            user_updates = map(self._copy_groups, users_qs)
            self.stdout.write(f"Indexing {users_qs.count()} users")
            self.user_core.update(user_updates)
            self.user_core.swap_execute()

        self.stdout.write("Checking studies index")
        if options['force'] or len(self.study_core) == 0:
            study_qs = self.study_core.get_queryset()
            self.study_core.swap().clear()
            self.stdout.write(f"Indexing {study_qs.count()} studies")
            self.study_core.update(study_qs)
            self.study_core.swap_execute()

        self.stdout.write("Checking metabolite index")
        if options['force'] or len(self.measurement_core) == 0:
            metabolite_qs = solr.MeasurementTypeSearch.get_queryset()
            self.measurement_core.swap().clear()
            self.stdout.write(f"Indexing {metabolite_qs.count()} metabolites")
            self.measurement_core.update(metabolite_qs)
            self.measurement_core.swap_execute()

    def _copy_groups(self, user):
        # Normally should use the following line:
        # user = self.backend.get_user(user.pk)
        # ... but this will save a database query
        _LDAPUser(self.backend, user=user)
        try:
            user.ldap_user._mirror_groups()
        except Exception as e:
            # _mirror_groups fails when ldap_user is not Active
            user.groups.clear()
        return user
