
"""
Populate the Solr indexes used by EDD.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django_auth_ldap.backend import LDAPBackend
from main.models import Study
from main.solr import StudySearch, UserSearch
from optparse import make_option

class Command(BaseCommand):
    backend = LDAPBackend()
    study_solr = StudySearch()
    user_solr = UserSearch()

    def handle(self, *args, **kwargs):
        User = get_user_model()
        print("Clearing user index")
        self.user_solr.clear()
        print("Indexing users")
        self.user_solr.update(map(self._copy_groups, User.objects.select_related('userprofile')))
        print("Clearing studies index")
        self.study_solr.clear()
        print("Indexing studies")
        self.study_solr.update(Study.objects.select_related(
            'updated__mod_by__userprofile',
            'created__mod_by__userprofile',
            ))

    def _copy_groups(self, user):
        ldap_user = self.backend.get_user(user.pk)
        try:
            ldap_user.ldap_user._mirror_groups()
        except Exception, e:
            # _mirror_groups fails when ldap_user is not Active
            user.groups.clear()
        return user
