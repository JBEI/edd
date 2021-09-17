"""
Module contains tasks to be executed asynchronously by Celery worker nodes.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils.translation import gettext as _

from edd.notify.backend import RedisBroker
from main.signals import study_exported, study_worklist

from . import forms
from .broker import ExportBroker
from .table import TableExport, WorklistExport

logger = get_task_logger(__name__)


@shared_task(bind=True)
def export_table_task(self, user_id, param_path):
    """
    Task runs the code for creating an export, from form data validated by a view.

    :param user_id: the primary key of the user running the export
    :param param_path: the key returned from main.redis.ScratchStorage.save()
        used to access saved export parameters
    :throws RuntimeError: on any errors occurring while running the export
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
            url = f'{reverse("export:export")}?download={export_id}'
            message = _(
                'Your export for "{name}" is ready. '
                '<a href="{url}" class="download" download="">Download the file here</a>.'
            ).format(name=export_name, url=url)
            notifications.notify(message, tags=("download",), payload={"url": url})
        except Exception as e:
            logger.exception("Failure in export_table_task: %s", e)
            message = _("Export failed. EDD encountered this problem: {ex}").format(
                ex=e
            )
            notifications.notify(message)
        notifications.mark_read(self.request.id)
        return export_id
    except Exception as e:
        logger.exception("Failure in export_table_task: %s", e)
        raise RuntimeError(
            _("Failed export, EDD encountered this problem: {e}").format(e=e)
        )


def execute_export_table(broker, user, export_id, param_path):
    params = broker.load_params(param_path)
    selection = forms.ExportSelectionForm(data=params, user=user).selection
    init_options = forms.ExportOptionForm.initial_from_user_settings(user)
    options = forms.ExportOptionForm(
        data=params, initial=init_options, selection=selection
    ).options
    # create and persist the export object
    export = TableExport(selection, options)
    first_study = selection.studies[0]
    broker.save_export(export_id, first_study.name, export)
    # no longer need the param data
    broker.clear_params(param_path)
    study_exported.send(
        sender=TableExport,
        study=first_study,
        user=user,
        count=selection.lines.count(),
        cross=selection.studies.count() > 1,
    )
    return first_study.name


@shared_task(bind=True)
def export_worklist_task(self, user_id, param_path):
    """
    Task runs the code for creating a worklist export, from form data validated by a view.

    :param user_id: the primary key of the user running the worklist
    :param param_path: the key returned from main.redis.ScratchStorage.save()
        used to access saved worklist parameters
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
            url = f'{reverse("export:worklist")}?download={export_id}'
            message = _(
                'Your worklist for "{name}" is ready. '
                '<a href="{url}" class="download">Download the file here</a>.'
            ).format(name=export_name, url=url)
            notifications.notify(message, tags=("download",), payload={"url": url})
        except Exception as e:
            logger.exception(f"Failure in export_worklist_task: {e}")
            message = _("Export failed. EDD encountered this problem: {ex}").format(
                ex=e
            )
            notifications.notify(message)
        notifications.mark_read(self.request.id)
        return export_id
    except Exception as e:
        logger.exception("Failure in export_worklist_task: %s", e)
        raise RuntimeError(
            _("Failed export, EDD encountered this problem: {e}").format(e=e)
        )


def execute_export_worklist(broker, user, export_id, param_path):
    params = broker.load_params(param_path)
    selection = forms.ExportSelectionForm(data=params, user=user).selection
    worklist_def = forms.WorklistForm(data=params)
    # create worklist object
    export = WorklistExport(selection, worklist_def.options, worklist_def.worklist)
    first_study = selection.studies[0]
    broker.save_export(export_id, first_study.name, export)
    # no longer need the param data
    broker.clear_params(param_path)
    study_worklist.send(
        sender=WorklistExport,
        study=first_study,
        user=user,
        count=selection.lines.count(),
        cross=selection.studies.count() > 1,
    )
    return first_study.name
