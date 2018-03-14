"""
Counterpart to wsgi.py configuring ASGI for the edd project.

It exposes the ASGI channel layer object as a module-level variable named ``channel_layer``.

For more information on this file, see
https://channels.readthedocs.io/en/stable/deploying.html
"""

import os
from channels.asgi import get_channel_layer

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "edd.settings")

channel_layer = get_channel_layer()
