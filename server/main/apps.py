"""
This is normally unnecessary, but we're using EDDConfig.ready() to do a bit of
monkey patching on the User model (since Django won't let us do this when
models.py is first loaded).
"""

from django.apps import AppConfig


class EDDConfig(AppConfig):
    name = "main"

    def ready(self):
        # make sure to load/register all the signals
        from . import signals  # noqa
