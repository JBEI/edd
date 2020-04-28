import logging

from asgiref.sync import async_to_sync, sync_to_async
from channels.layers import get_channel_layer

from edd.notify.backend import Notification
from edd.utilities import JSONEncoder

channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)


class WsBroker:
    """
    A stateless broker that streams transient notifications directly to its
    groups without any storage.
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
