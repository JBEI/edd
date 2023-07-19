from django.conf import settings
from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.contrib.flatpages import views as flatpage_views
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import include, path, re_path
from requests import codes

from edd.branding.views import favicon as favicon_view

admin.autodiscover()


def healthcheck(request):
    """Simplest possible view for healthcheck."""
    return HttpResponse(status=codes.no_content)


def ping(request):
    """Simplest possible view for login status."""
    if request.user.is_authenticated:
        return HttpResponse(status=codes.no_content)
    return HttpResponse(status=codes.forbidden)


def legacy_issue_no_strain_url(request):
    """Simplest possible view for the legacy_issue_no_strain_url page."""
    return TemplateResponse(request, "main/legacy_issue_no_strain_url.html", {})


rest_urlpatterns = [
    path("", include("edd.rest.urls", namespace="rest")),
    path("auth/", include("rest_framework.urls", namespace="rest_framework")),
]

urlpatterns = [
    # make sure to match the path to favicon *exactly*
    re_path(r"favicon\.ico$", favicon_view, name="favicon"),
    path("health/", healthcheck, name="healthcheck"),
    path("ping/", ping, name="ping"),
    path("admin/", admin.site.urls),
    path("", include("main.urls", namespace="main")),
    path("", include("edd.campaign.urls", namespace="campaign")),
    # allauth does not support namespacing
    path("accounts/", include("allauth.urls")),
    path("describe/", include("edd.describe.flat_urls", namespace="describe_flat")),
    path("export/", include("edd.export.urls", namespace="export")),
    path("load/", include("edd.load.flat_urls", namespace="load_flat")),
    path("profile/", include("edd.profile.urls", namespace="profile")),
    path("rest/", include(rest_urlpatterns)),
    path("search/", include("edd.search.urls", namespace="search")),
    # flatpages.urls does not include app_name; cannot include it with namespace
    # path('pages/', include('django.contrib.flatpages.urls', namespace='flatpage'))
    path("pages/<path:url>", flatpage_views.flatpage, name="flatpage"),
    path(
        "legacy_issue_no_strain_url.html",
        legacy_issue_no_strain_url,
        name="legacy_issue_no_strain_url",
    ),
]

if getattr(settings, "EDD_ENABLE_GRAPHQL", False):
    from graphene_django.views import GraphQLView

    urlpatterns += [
        path(
            "explore/",
            login_required(GraphQLView.as_view(graphiql=True)),
            name="graphiql",
        ),
        path(
            "graphql/",
            login_required(GraphQLView.as_view()),
            name="graphql",
        ),
    ]

if getattr(settings, "DEBUG", False):
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls, namespace="djdt"))]
