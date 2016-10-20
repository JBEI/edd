
"""
Populate the Solr indexes used by EDD.
"""

from django.core.management.base import BaseCommand
from django_auth_ldap.backend import LDAPBackend, _LDAPUser

from main import solr


class Command(BaseCommand):
    backend = LDAPBackend()
    study_core = solr.StudySearch()
    user_core = solr.UserSearch()
    measurement_core = solr.MeasurementTypeSearch()

    def handle(self, *args, **kwargs):
        print("Clearing user index")
        self.user_core.swap().clear()
        users_qs = self.user_core.get_queryset()
        user_updates = map(self._copy_groups, users_qs)
        print("Indexing %s users" % users_qs.count())
        self.user_core.update(user_updates)
        self.user_core.swap_execute()

        print("Clearing studies index")
        self.study_core.swap().clear()
        study_qs = self.study_core.get_queryset()
        print("Indexing %s studies" % study_qs.count())
        self.study_core.update(study_qs)
        self.study_core.swap_execute()

        print("Clearing metabolite index")
        self.measurement_core.swap().clear()
        metabolite_qs = solr.MeasurementTypeSearch.get_queryset()
        print("Indexing %s metabolites" % metabolite_qs.count())
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
