# coding: utf-8

from django.contrib import messages
from django.db import transaction
from django.utils.translation import ugettext as _
from messages_extends import constants as msg_constants

from edd import celery_app


class TaskNotification(object):
    """ Checks for any pending tasks for the user, and displays a message if any tasks
        completed or failed. """

    def __init__(self, *args, **kwargs):
        self._fake_task = celery_app.Task()

    def process_request(self, request):
        # nothing to do if there is no user or user is not authenticated
        if not request.user or not request.user.is_authenticated():
            return
        if hasattr(request.user, 'userprofile'):
            tasks = request.user.userprofile.tasks
            with transaction.atomic():
                to_check = tasks.select_for_update().filter(notified=False)
                for task in to_check:
                    self._check(request, task)

    def _check(self, request, task):
        result = self._fake_task.AsyncResult(str(task.uuid))
        if result.successful():
            msg = str(result.info)
            messages.add_message(request, msg_constants.SUCCESS_PERSISTENT, msg)
            task.notified = True
            task.save()
        elif result.failed():
            msg = _('An import task failed with error: %(task_error)s') % {
                'task_error': result.info,
            }
            messages.add_message(request, msg_constants.ERROR_PERSISTENT, msg)
            task.notified = True
            task.save()
