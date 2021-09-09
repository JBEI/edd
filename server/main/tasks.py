"""
Module contains tasks to be executed asynchronously by Celery worker nodes.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
from django.db.models import F

from edd.search.registry import AdminRegistry

from . import models
from .query import build_study_url

logger = get_task_logger(__name__)


def delay_calculation(task):
    """Calculates a delay for a task using exponential backoff."""
    return task.default_retry_delay + (2 ** (task.request.retries + 1))


@shared_task(bind=True)
def link_ice_entry_to_study(self, strain, study):
    """
    Task runs the code to register a link between an ICE entry and an EDD study.

    :param strain: the primary key of the EDD main.models.Strain in the link
    :param study: the primary key of the EDD main.models.Study in the link
    :throws Exception: for any errors other than communication errors to ICE instance
    """
    # check that strain and study are still linked
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if query.exists():
        try:
            # query the slug and name in use when this task runs
            record = (
                query.annotate(
                    study_slug=F("line__study__slug"), study_name=F("line__study__name")
                )
                .distinct()
                .get()
            )
            # always running as configured admin account
            ice = AdminRegistry()
            with ice.login():
                entry = ice.get_entry(record.registry_id)
                entry.add_link(record.study_name, build_study_url(record.study_slug))
        except Exception as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)


@shared_task(bind=True)
def unlink_ice_entry_from_study(self, strain, study):
    """
    Task runs the code to de-register a link between an ICE entry and an EDD study.

    :param strain: the primary key of the EDD main.models.Strain in the former link
    :param study: the primary key of the EDD main.models.Study in the former link
    :throws Exception: for any errors other than communication errors to ICE instance
    """
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if not query.exists():
        try:
            record = models.Strain.objects.get(pk=strain)
            study_obj = models.Study.objects.get(pk=study)
            url = build_study_url(study_obj.slug)
            # always running as configured admin account
            ice = AdminRegistry()
            with ice.login():
                entry = ice.get_entry(record.registry_id)
                for link in entry.list_links():
                    # first item is ID, third item is the link URL
                    if link[2] == url:
                        entry.remove_link(link[0])
        except Exception as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)


@shared_task
def template_sync_species(template_id):
    """
    Task parses an SBML document, then creates MetaboliteSpecies and MetaboliteExchange records
    for every species and single-reactant reaction in the model.
    """
    instance = models.SBMLTemplate.objects.get(pk=template_id)
    doc = instance.parseSBML()
    model = doc.getModel()
    # filter to only those for the updated template
    species_qs = models.MetaboliteSpecies.objects.filter(sbml_template=instance)
    exchange_qs = models.MetaboliteExchange.objects.filter(sbml_template=instance)
    exist_species = set(species_qs.values_list("species", flat=True))
    exist_exchange = set(exchange_qs.values_list("exchange_name", flat=True))
    # creating any records not in the database
    for species in map(lambda s: s.getId(), model.getListOfSpecies()):
        if species not in exist_species:
            models.MetaboliteSpecies.objects.get_or_create(
                sbml_template=instance, species=species
            )
        else:
            exist_species.discard(species)
    reactions = map(
        lambda r: (r.getId(), r.getListOfReactants()), model.getListOfReactions()
    )
    for reaction, reactants in reactions:
        if len(reactants) == 1 and reaction not in exist_exchange:
            models.MetaboliteExchange.objects.get_or_create(
                sbml_template=instance,
                exchange_name=reaction,
                reactant_name=reactants[0].getSpecies(),
            )
        else:
            exist_exchange.discard(reaction)
    # removing any records in the database not in the template document
    species_qs.filter(species__in=exist_species).delete()
    exchange_qs.filter(exchange_name__in=exist_exchange).delete()
