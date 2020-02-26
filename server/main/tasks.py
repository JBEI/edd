"""
Module contains tasks to be executed asynchronously by Celery worker nodes.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import F
from requests.exceptions import RequestException

from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi, IceApiException

from . import models
from .query import build_study_url

logger = get_task_logger(__name__)
User = get_user_model()


def create_ice_connection(user_token):
    """Creates an instance of the ICE API using common settings."""
    # Use getattr to load settings without raising AttributeError
    key_id = getattr(settings, "ICE_KEY_ID", None)
    url = getattr(settings, "ICE_URL", None)
    verify = getattr(settings, "ICE_VERIFY_CERT", False)
    timeout = getattr(settings, "ICE_REQUEST_TIMEOUT", None)
    if key_id and url:
        try:
            auth = HmacAuth(key_id=key_id, username=user_token)
            ice = IceApi(auth=auth, base_url=url, verify_ssl_cert=verify)
            if timeout:
                ice.timeout = timeout
            ice.write_enabled = True
            return ice
        except Exception as e:
            logger.error("Failed to create ICE connection: %s", e)
    return None


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
            # always running as configured admin account
            ice = create_ice_connection(settings.ICE_ADMIN_ACCOUNT)
            record = (
                query.annotate(
                    study_slug=F("line__study__slug"), study_name=F("line__study__name")
                )
                .distinct()
                .get()
            )
            url = build_study_url(record.study_slug)
            ice.add_experiment_link(record.registry_id, record.study_name, url)
        except IceApiException as e:
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
            # always running as configured admin account
            ice = create_ice_connection(settings.ICE_ADMIN_ACCOUNT)
            record = models.Strain.objects.get(pk=strain)
            study_obj = models.Study.objects.get(pk=study)
            url = build_study_url(study_obj.slug)
            ice.unlink_entry_from_study(record.registry_id, url)
        except RequestException as e:
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
