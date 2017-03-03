from django.contrib.sites.shortcuts import get_current_site
from django.http import HttpResponse


def favicon(request):
    try:
        site = get_current_site(request)
        favicon = site.page.branding.flavicon_file
    except:
        favicon = ""
    return HttpResponse(favicon.read(), content_type="image/x-icon")
