# -*- coding: utf-8 -*-

import arrow
import logging

from collections import namedtuple
from uuid import uuid4


logger = logging.getLogger(__name__)


NotificationBase = namedtuple('NotificationBase', (
    'message',
    'tags',
    'time',
    'uuid',
))
class Notification(NotificationBase):
    """
    A notification message to be stored in a notification backend and delivered to users.
    """
    __slots__ = ()

    def __new__(cls, message, tags=tuple(), time=None, uuid=None):
        time = arrow.utcnow().timestamp if time is None else time
        uuid = uuid4() if uuid is None else uuid
        self = super(Notification, cls).__new__(cls, message, tuple(tags), time, uuid)
        return self

    def __eq__(self, other):
        return isinstance(other, Notification) and self.uuid == other.uuid

    def __hash__(self):
        return hash(self.uuid)

    def prepare(self):
        """
        Return a copy of the Notification with any lazy strings force-cast to concrete strings.
        """
        prep = Notification(
            message=str(self.message),
            tags=[str(tag) for tag in self.tags],
            time=self.time,
            uuid=self.uuid,
        )
        return prep


class BaseBroker(object):
    """
    Defines the API to use for setting, fetching, and clearing Notification objects.
    """

    def __init__(self, user, *args, **kwargs):
        self.user = user

    def __iter__(self):
        return self._loadAll().__iter__()

    def _load(self, uuid, *args, **kwargs):
        raise NotImplementedError("Subclasses of BaseBroker must provide a _load() method")

    def _loadAll(self, *args, **kwargs):
        raise NotImplementedError("Subclasses of BaseBroker must provide a _loadAll() method")

    def _remove(self, uuid, *args, **kwargs):
        raise NotImplementedError("Subclasses of BaseBroker must provide a _remove() method")

    def _store(self, notifications, *args, **kwargs):
        raise NotImplementedError("Subclasses of BaseBroker must provide a _store() method")

    def group_names(self):
        return [f'edd.notify.{self.user.username}']

    def mark_all_read(self, uuid=None):
        last = self._load(uuid)
        for note in self:
            if last is None or note.time < last.time:
                self.remove(note.uuid)

    def mark_read(self, uuid):
        self._remove(uuid)

    def notify(self, message, tags=[]):
        note = Notification(message, tags)
        # _store notification to self
        self._store(tuple(note))
        # send notification to Channel Group


class DefaultBroker(BaseBroker):
    # TODO

    def _load(self, uuid, *args, **kwargs):
        return None

    def _loadAll(self, *args, **kwargs):
        return []

    def _remove(self, uuid, *args, **kwargs):
        return None

    def _store(self, notifications, *args, **kwargs):
        return None
