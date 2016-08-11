
"""
Populate the Solr indexes used by EDD.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django_auth_ldap.backend import LDAPBackend

from main import models, solr


class Command(BaseCommand):
    backend = LDAPBackend()
    study_core = solr.StudySearch()
    user_core = solr.UserSearch()
    metabolite_core = solr.MetaboliteSearch()

    def handle(self, *args, **kwargs):
        User = get_user_model()
        print("Clearing user index")
        self.user_core.clear()
        print("Indexing users")
        self.user_core.update(map(self._copy_groups, User.objects.select_related('userprofile')))
        print("Clearing studies index")
        self.study_core.clear()
        print("Indexing studies")
        self.study_core.update(models.Study.objects.select_related(
            'updated__mod_by__userprofile',
            'created__mod_by__userprofile',
        ))
        print("Clearing metabolite index")
        self.metabolite_core.clear()
        print("Indexing metabolites")
        self.metabolite_core.update(solr.MetaboliteSearch.get_queryset())

    def _copy_groups(self, user):
        ldap_user = self.backend.get_user(user.pk)
        try:
            ldap_user.ldap_user._mirror_groups()
        except Exception as e:
            # _mirror_groups fails when ldap_user is not Active
            user.groups.clear()
        return user
