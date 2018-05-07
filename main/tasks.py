# coding: utf-8
"""
Module contains tasks to be executed asynchronously by Celery worker nodes.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import F
from django.http import QueryDict
from django.urls import reverse
from django.utils.translation import ugettext as _
from requests.exceptions import RequestException

from . import models
from .export import forms as export_forms
from .export.broker import ExportBroker
from .export.table import TableExport, WorklistExport
from .importer.table import TableImport
from .redis import ScratchStorage
from .utilities import get_absolute_url
from edd.notify.backend import RedisBroker
from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi


logger = get_task_logger(__name__)
User = get_user_model()


def build_study_url(slug):
    """
    Constructs a full URL (e.g. https://example.com/edd/s/my-study/) for a study from a slug.
    """
    path = reverse('main:overview', kwargs={'slug': slug})
    return get_absolute_url(path)


def create_ice_connection(user_token):
    """
    Creates an instance of the ICE API using common settings.
    """
    # Use getattr to load settings without raising AttributeError
    key_id = getattr(settings, 'ICE_KEY_ID', None)
    url = getattr(settings, 'ICE_URL', None)
    verify = getattr(settings, 'ICE_VERIFY_CERT', False)
    timeout = getattr(settings, 'ICE_REQUEST_TIMEOUT', None)
    if key_id and url:
        try:
            auth = HmacAuth(key_id=key_id, username=user_token)
            ice = IceApi(auth=auth, base_url=url, verify_ssl_cert=verify)
            if timeout:
                ice.timeout = timeout
            ice.write_enabled = True
            return ice
        except Exception as e:
            logger.error('Failed to create connection: %s', e)
    return None


def delay_calculation(task):
    """
    Calculates a delay for a task using exponential backoff.
    """
    # delay is default + 2**n seconds
    return task.default_retry_delay + (2 ** (task.request.retries + 1))


@shared_task(bind=True)
def export_table_task(self, user_id, param_path):
    """
    Task runs the code for creating an export, from form data validated by a view.

    :param user_id: the primary key of the user running the export
    :param param_path: the key returned from main.redis.ScratchStorage.save() used to access
        saved export parameters
    :returns: the key used to access exported data from main.redis.ScratchStorage.load()
    :throws RuntimeError: on any errors occuring while running the export
    """
    try:
        # load info needed to build export
        User = get_user_model()
        user = User.objects.get(id=user_id)
        notifications = RedisBroker(user)
        broker = ExportBroker(user_id)
        export_id = self.request.id[:8]
        # execute the export
        try:
            export_name = execute_export_table(broker, user, export_id, param_path)
            url = f'{reverse("main:export")}?download={export_id}'
            message = _(
                'Your export for "{name}" is ready. '
                '<a href="{url}" class="download">Download the file here</a>.'
            ).format(name=export_name, url=url)
            notifications.notify(message, tags=('download', ))
        except Exception as e:
            logger.exception('Failure in export_table_task: %s', e)
            message = _(
                'Export failed. EDD encountered this problem: {ex}'
            ).format(ex=e)
            notifications.notify(message)
        notifications.mark_read(self.request.id)
    except Exception as e:
        logger.exception('Failure in export_table_task: %s', e)
        raise RuntimeError(_('Failed export, EDD encountered this problem: {e}').format(e=e))


def execute_export_table(broker, user, export_id, param_path):
    params = broker.load_params(param_path)
    selection = export_forms.ExportSelectionForm(data=params, user=user).selection
    init_options = export_forms.ExportOptionForm.initial_from_user_settings(user)
    options = export_forms.ExportOptionForm(
        data=params,
        initial=init_options,
        selection=selection
    ).options
    # create and persist the export object
    export = TableExport(selection, options)
    broker.save_export(export_id, selection.studies[0].name, export)
    # no longer need the param data
    broker.clear_params(param_path)
    return selection.studies[0].name


@shared_task(bind=True)
def export_worklist_task(self, user_id, param_path):
    """
    Task runs the code for creating a worklist export, from form data validated by a view.

    :param user_id: the primary key of the user running the worklist
    :param param_path: the key returned from main.redis.ScratchStorage.save() used to access
        saved worklist parameters
    :returns: the key used to access worklist data from main.redis.ScratchStorage.load()
    :throws RuntimeError: on any errors occuring while running the export
    """
    try:
        # load info needed to build worklist
        User = get_user_model()
        user = User.objects.get(id=user_id)
        notifications = RedisBroker(user)
        broker = ExportBroker(user_id)
        export_id = self.request.id[:8]
        try:
            export_name = execute_export_worklist(broker, user, export_id, param_path)
            url = f'{reverse("main:worklist")}?download={export_id}'
            message = _(
                'Your worklist for "{name}" is ready. '
                '<a href="{url}" class="download">Download the file here</a>.'
            ).format(name=export_name, url=url)
            notifications.notify(message, tags=('download', ))
        except Exception as e:
            logger.exception(f'Failure in export_worklist_task: {e}')
            message = _(
                'Export failed. EDD encountered this problem: {ex}'
            ).format(ex=e)
            notifications.notify(message)
        notifications.mark_read(self.request.id)
    except Exception as e:
        logger.exception('Failure in export_worklist_task: %s', e)
        raise RuntimeError(_('Failed export, EDD encountered this problem: {e}').format(e=e))


def execute_export_worklist(broker, user, export_id, param_path):
    params = broker.load_params(param_path)
    selection = export_forms.ExportSelectionForm(data=params, user=user).selection
    worklist_def = export_forms.WorklistForm(data=params)
    # create worklist object
    export = WorklistExport(selection, worklist_def.options, worklist_def.worklist)
    broker.save_export(export_id, selection.studies[0].name, export)
    # no longer need the param data
    broker.clear_params(param_path)
    return selection.studies[0].name


@shared_task(bind=True)
def import_table_task(self, study_id, user_id, data_path):
    """
    Task runs the code for importing a table of data.

    :param study_id: the primary key of the target study
    :param user_id: the primary key of the user running the import
    :param data_path: the key returned from main.redis.ScratchStorage.save() used to access the
        import data
    :returns: a message to display via the TaskNotification middleware
    :throws RuntimeError: on any errors occuring while running the import
    """
    try:
        storage = ScratchStorage()
        study = models.Study.objects.get(pk=study_id)
        user = User.objects.get(pk=user_id)
        notifications = RedisBroker(user)
        data = storage.load(data_path)
        importer = TableImport(study, user)
        try:
            # data stored as urlencoded string, convert back to QueryDict
            (added, updated) = importer.import_data(QueryDict(data))
            storage.delete(data_path)
            message = _(
                'Finished import to {study}: {added} added and {updated} updated measurements.'
            ).format(study=study.name, added=added, updated=updated)
            notifications.notify(message)
        except Exception as e:
            logger.exception(f'Failure in import_table_task: {e}')
            message = _(
                'Failed import to {study}, EDD encountered this problem: {ex}'
            ).format(study=study.name, ex=e)
            notifications.notify(message)
        notifications.mark_read(self.request.id)
    except Exception as e:
        logger.exception(f'Failure in import_table_task: {e}')
        raise RuntimeError(
            _('Failed import to %(study)s, EDD encountered this problem: %(problem)s') % {
                'problem': e,
                'study': study.name,
            }
        )


@shared_task(bind=True)
def link_ice_entry_to_study(self, user_token, strain, study):
    """
    Task runs the code to register a link between an ICE entry and an EDD study.

    :param user_token: the token used to identify a user to ICE
    :param strain: the primary key of the EDD main.models.Strain in the link
    :param study: the primary key of the EDD main.models.Study in the link
    :throws Exception: for any errors other than communication errors to ICE instance
    """
    # check that strain and study are still linked
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if query.exists():
        try:
            ice = create_ice_connection(user_token)
            record = query.annotate(
                study_slug=F('line__study__slug'),
                study_name=F('line__study__name'),
            ).distinct().get()
            url = build_study_url(record.study_slug)
            ice.link_entry_to_study(record.registry_id, study, url, record.study_name)
        except RequestException as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)
        except Exception as e:
            raise e


@shared_task(bind=True)
def unlink_ice_entry_from_study(self, user_token, strain, study):
    """
    Task runs the code to de-register a link between an ICE entry and an EDD study.

    :param user_token: the token used to identify a user to ICE
    :param strain: the primary key of the EDD main.models.Strain in the former link
    :param study: the primary key of the EDD main.models.Study in the former link
    :throws Exception: for any errors other than communication errors to ICE instance
    """
    query = models.Strain.objects.filter(pk=strain, line__study__pk=study)
    if not query.exists():
        try:
            ice = create_ice_connection(user_token)
            record = models.Strain.objects.get(pk=strain)
            study_obj = models.Study.objects.get(pk=study)
            url = build_study_url(study_obj.slug)
            ice.unlink_entry_from_study(record.registry_id, study, url)
        except RequestException as e:
            # Retry when there are errors communicating with ICE
            raise self.retry(exc=e, countdown=delay_calculation(self), max_retries=10)
        except Exception as e:
            raise e


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
    exist_species = set(species_qs.values_list('species', flat=True))
    exist_exchange = set(exchange_qs.values_list('exchange_name', flat=True))
    # creating any records not in the database
    for species in map(lambda s: s.getId(), model.getListOfSpecies()):
        if species not in exist_species:
            models.MetaboliteSpecies.objects.get_or_create(
                sbml_template=instance,
                species=species
            )
        else:
            exist_species.discard(species)
    reactions = map(lambda r: (r.getId(), r.getListOfReactants()), model.getListOfReactions())
    for reaction, reactants in reactions:
        if len(reactants) == 1 and reaction not in exist_exchange:
            models.MetaboliteExchange.objects.get_or_create(
                sbml_template=instance,
                exchange_name=reaction,
                reactant_name=reactants[0].getSpecies()
            )
        else:
            exist_exchange.discard(reaction)
    # removing any records in the database not in the template document
    species_qs.filter(species__in=exist_species).delete()
    exchange_qs.filter(exchange_name__in=exist_exchange).delete()
