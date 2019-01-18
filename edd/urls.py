# -*- coding: utf-8 -*-

from django.conf import settings
from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.contrib.flatpages import views as flatpage_views
from django.http import HttpResponse
from django.urls import include, path, re_path

from edd.branding.views import favicon as favicon_view


admin.autodiscover()


rest_urlpatterns = [
    path('', include('edd.rest.urls', namespace='rest')),
    path('auth/', include('rest_framework.urls', namespace='rest_framework')),
]

urlpatterns = [
    # make sure to match the path to favicon *exactly*
    re_path(r'favicon\.ico$', favicon_view, name='favicon'),
    # simplest possible view for healthcheck
    path('health/', lambda request: HttpResponse(), name='healthcheck'),
    path('admin/', admin.site.urls),
    path('', include('main.urls', namespace='main')),
    path('accounts/', include('allauth.urls')),  # allauth does not support namespacing
    path('messages/', include('messages_extends.urls')),
    path('utilities/', include('edd_utils.urls', namespace='edd_utils')),
    path('profile/', include('edd.profile.urls', namespace='profile')),
    path('rest/', include(rest_urlpatterns)),
    # flatpages.urls does not include app_name; cannot include it with namespace
    # path('pages/', include('django.contrib.flatpages.urls', namespace='flatpage'))
    path('pages/<path:url>', flatpage_views.flatpage, name='flatpage'),
]

if getattr(settings, 'EDD_ENABLE_GRAPHQL', False):
    from graphene_django.views import GraphQLView
    urlpatterns += [
        path('graphql/', login_required(GraphQLView.as_view(graphiql=True))),
    ]

if 'edd_file_importer' in settings.INSTALLED_APPS:
    urlpatterns += [
        path('', include('edd_file_importer.urls', namespace='edd_file_importer')),
    ]

if getattr(settings, 'DEBUG', False):
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls, namespace='djdt')),
    ]
