"""
Counterpart to wsgi.py configuring ASGI for the edd project.

It exposes the ASGI channel layer object as a module-level variable named ``channel_layer``.

For more information on this file, see
https://channels.readthedocs.io/en/stable/deploying.html
"""

import django
import os

from channels.routing import get_default_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")
django.setup()
application = get_default_application()
