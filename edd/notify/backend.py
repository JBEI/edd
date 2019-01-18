# -*- coding: utf-8 -*-

import arrow
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from collections import namedtuple
from django_redis import get_redis_connection
from uuid import UUID, uuid4

from edd.utilities import JSONDecoder, JSONEncoder


channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)


NotificationBase = namedtuple("NotificationBase", ("message", "tags", "payload", "time", "uuid"))


class Notification(NotificationBase):
    """
    A notification message to be stored in a notification backend and delivered to users.
    """

    __slots__ = ()

    def __new__(cls, message, tags=None, payload=None, time=None, uuid=None):
        tags = tuple() if tags is None else tuple(tags)
        time = arrow.utcnow().timestamp if time is None else time
        uuid = uuid4() if uuid is None else uuid
        self = super().__new__(cls, message, tags, payload, time, uuid)
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
            payload=self.payload,
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
        raise NotImplementedError(
            "Subclasses of BaseBroker must provide a _load() method"
        )

    def _loadAll(self, *args, **kwargs):
        raise NotImplementedError(
            "Subclasses of BaseBroker must provide a _loadAll() method"
        )

    def _remove(self, uuid, *args, **kwargs):
        raise NotImplementedError(
            "Subclasses of BaseBroker must provide a _remove() method"
        )

    def _store(self, notification, *args, **kwargs):
        raise NotImplementedError(
            "Subclasses of BaseBroker must provide a _store() method"
        )

    def count(self):
        raise NotImplementedError("This broker does not support count() method")

    def group_names(self):
        return [f"edd.notify.{self.user.username}"]

    def mark_all_read(self, uuid=None):
        last = self._load(uuid)
        for note in self:
            if last is None or note.time <= last.time:
                self.mark_read(note.uuid)
        # send update to Channel Group
        self.send_to_groups({"type": "notification.reset"})

    def mark_read(self, uuid):
        self._remove(uuid)
        # send update to Channel Group
        self.send_to_groups(
            {"type": "notification.dismiss", "uuid": JSONEncoder.dumps(uuid)}
        )

    def notify(self, message, tags=None, payload=None, uuid=None):
        logger.debug(f"Notify: {message} tags: {tags} uuid={uuid}, payload={payload}")

        note = Notification(message, tags=tags, payload=payload, uuid=uuid)
        # _store notification to self
        self._store(note)
        # send notification to Channel Groups
        self.send_to_groups(
            {"type": "notification", "notice": JSONEncoder.dumps(note.prepare())}
        )

    def send_to_groups(self, payload):
        for group in self.group_names():
            logger.debug(f"group_send to {group}: {payload}")
            async_to_sync(channel_layer.group_send)(group, payload)


class RedisBroker(BaseBroker):
    """
    RedisBroker uses a redis backend to store notifications.
    """

    def __init__(self, user, *args, **kwargs):
        super().__init__(user, *args, **kwargs)
        self._redis = get_redis_connection("default")

    def _convert(self, payload):
        if isinstance(payload, bytes):
            return Notification(*JSONDecoder.loads(payload.decode("utf-8")))
        return None

    def _key_notification(self, uuid):
        if isinstance(uuid, bytes):
            uuid = uuid.decode("utf-8")
        elif isinstance(uuid, UUID):
            uuid = str(uuid)
        return f"{self._key_user()}:{uuid}"

    def _key_user(self):
        return f"{__name__}.{self.__class__.__name__}:{self.user.username}"

    def _load(self, uuid, *args, **kwargs):
        payload = self._redis.get(self._key_notification(uuid))
        return self._convert(payload)

    def _loadAll(self, *args, **kwargs):
        # fetch 10 at a time; range is exclusive of end, zrevrange is inclusive of end
        psize = 10
        for page in range(0, self.count(), psize):
            ids = self._redis.zrevrange(self._key_user(), page, page + psize - 1)
            keys = [self._key_notification(uuid) for uuid in ids]
            for payload in self._redis.mget(keys):
                if payload is not None:
                    yield self._convert(payload)

    def _remove(self, uuid, *args, **kwargs):
        # remove from set of notifications
        self._redis.zrem(self._key_user(), str(uuid))
        # remove notification
        self._redis.delete(self._key_notification(uuid))

    def _store(self, notification, *args, **kwargs):
        # save the notification itself
        key = self._key_notification(notification.uuid)
        self._redis.set(key, JSONEncoder.dumps(notification), nx=True)
        # store the uuid in a sorted set of all user's notifications
        # scores in sorted set are by time, allowing retreival from specific time periods
        self._redis.zadd(self._key_user(), {str(notification.uuid): notification.time})

    def count(self):
        return self._redis.zcard(self._key_user())

    def mark_all_read(self, uuid=None):
        if uuid is None:
            # shortcut for redis when not marking read from a given point: delete everything
            self._redis.delete(self._key_user(), f"{self._key_user()}:*")
        # parent will loop over all and remove anything older than uuid; then send reset message
        super().mark_all_read(uuid=uuid)
