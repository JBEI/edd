# coding: utf-8
from __future__ import absolute_import, unicode_literals

import logging

from django.http import QueryDict

from main.redis import ScratchStorage

"""
Utility code to handle negotiations and persistence of data in EDD exports.
"""


logger = logging.getLogger(__name__)


class ExportBroker(object):
    def __init__(self, user_id):
        self.user = user_id
        key_prefix = f"{__name__}.{self.__class__.__name__}:"
        self.storage = ScratchStorage(key_prefix=key_prefix)

    def _export_name(self, task_id):
        return f"{self.user}:{task_id}"

    def _name_name(self, task_id):
        return f"{self._export_name(task_id)}:name"

    def clear_params(self, path):
        self.storage.delete(path)

    def load_export(self, task_id):
        # convert names into storage keys first
        key = self._export_name(task_id)
        return self.storage.load(key)

    def load_export_name(self, task_id):
        # convert names into storage keys first
        key = self._name_name(task_id)
        return self.storage.load(key).decode("utf-8")

    def load_params(self, path):
        return QueryDict(self.storage.load(path))

    def save_export(self, task_id, name, export):
        self.storage.save(export.output(), name=self._export_name(task_id))
        self.storage.save(name, name=self._name_name(task_id))

    def save_params(self, payload):
        return self.storage.save(payload.urlencode())
