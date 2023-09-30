import logging

from django.contrib.sites.shortcuts import get_current_site
from django.contrib.staticfiles.storage import staticfiles_storage
from django.http import HttpResponse

logger = logging.getLogger(__name__)


def favicon(request):
    try:
        site = get_current_site(request)
        # must explicitly open ImageField objects
        favicon = site.page.branding.favicon_file.open()
    except Exception as e:
        logger.exception(f"Failed getting branding favicon, using default: {e}")
        favicon = staticfiles_storage.open("favicon.ico")
    with favicon:
        return HttpResponse(favicon.read(), content_type="image/x-icon")
