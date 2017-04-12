from django.contrib.sites.shortcuts import get_current_site
from django.contrib.staticfiles.storage import staticfiles_storage
from django.http import HttpResponse


def favicon(request):
    try:
        site = get_current_site(request)
        favicon = site.page.branding.favicon_file
    except:
        favicon = staticfiles_storage.open('favicon.ico')
    with favicon:
        return HttpResponse(favicon.read(), content_type="image/x-icon")
