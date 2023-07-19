"""
Fill in missing Strain URLs with useful information; see: EDD-1472
"""

from django.core.management.base import BaseCommand
from django.urls import reverse

from edd.search.registry import AdminRegistry
from main.models import Strain


class Command(BaseCommand):
    help = "Fill in missing Strain URLs with useful information; see: EDD-1472."

    def handle(self, *args, **options):
        adminReg = AdminRegistry()
        with adminReg.login():
            for hasNoURL in Strain.objects.filter(registry_url__isnull=True):
                # Search ICE for the strain, or something like it
                # then put the url for anything found into registry_url
                # otherwise put a useful message about not finding anything that looks useful
                try:
                    hasNoURL.registry_url = next(
                        adminReg.search(hasNoURL.name)
                    ).registry_url
                except StopIteration:
                    hasNoURL.registry_url = reverse("legacy_issue_no_strain_url")
                hasNoURL.save()
