from django.db.models.signals import post_save
from django.dispatch import receiver
from main.models import Study
from main.solr import StudySearch

from . import study_modified

solr = StudySearch()

@receiver(post_save, sender=Study)
def study_saved(sender, instance, created, raw, **kwargs):
    if not raw:
        study_modified.send(sender, instance)

@receiver(study_modified)
def index_study(sender, study, **kwargs):
    solr.update([ study, ])
