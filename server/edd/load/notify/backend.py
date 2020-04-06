import logging
from collections import namedtuple
from uuid import uuid4

import arrow
from asgiref.sync import async_to_sync, sync_to_async
from channels.layers import get_channel_layer

from edd.utilities import JSONEncoder

channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)


NotificationBase = namedtuple(
    "NotificationBase", ("message", "tags", "payload", "time", "uuid")
)


class Notification(NotificationBase):
    """
    A notification message to be stored in a notification backend and delivered
    to users.
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
        Return a copy of the Notification with any lazy strings force-cast to
        concrete strings.
        """
        prep = Notification(
            message=str(self.message),
            tags=[str(tag) for tag in self.tags],
            payload=self.payload,
            time=self.time,
            uuid=self.uuid,
        )
        return prep


class WsBroker:
    """
    A stateless broker that streams transient notifications directly to its groups without any
    storage.
    """

    def __init__(self, user, *args, **kwargs):
        self.user = user

    def notify(self, message, tags=None, payload=None, uuid=None):
        logger.debug(
            f'Notify: "{message}", tags: {tags}, uuid={uuid}, payload={payload}'
        )

        note = Notification(message, tags=tags, payload=payload, uuid=uuid)
        # send notification to Channel Groups
        self.send_to_groups(
            {"type": "notification", "notice": JSONEncoder.dumps(note.prepare())}
        )

    def group_names(self):
        # channels group name must be *only* ASCII alphanum, hyphen, period
        # the primary key fits better than arbitrary unicode usernames
        return [f"edd.load.{self.user.pk}"]

    def send_to_groups(self, payload):
        for group in self.group_names():
            logger.debug(f"group_send to {group}: {payload}")
            async_to_sync(channel_layer.group_send)(group, payload)

    async def async_send_to_groups(self, payload):
        group_names = await sync_to_async(self.group_names)()
        for group in group_names:
            await self.logger_debug(f"async_send to {group}: {payload}")
            await channel_layer.group_send(group, payload)

    async def async_notify(self, message, tags=None, payload=None, uuid=None):
        note = Notification(message, tags=tags, payload=payload, uuid=uuid)

        # send notification to Channel Groups
        await self.async_send_to_groups(
            {"type": "notification", "notice": JSONEncoder.dumps(note.prepare())}
        )

    async def logger_debug(self, message):
        # looks nicer to call `await self.logger_debug("some message")`
        # than to call `await sync_to_async(logger.debug)("some message")`
        await sync_to_async(logger.debug)(message)
