from django.contrib.sites.shortcuts import get_current_site
from django.http import HttpResponse


def favicon(request):
    try:
        site = get_current_site(request)
        favicon = site.branding.flavicon_file
    except:
        favicon = "edd-django/main/static/main/images/edd_logo.png"
    return HttpResponse(favicon.read(), content_type="image/x-icon")
