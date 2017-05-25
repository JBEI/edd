from django.conf import settings
from django.conf.urls import include, url, static
from django.contrib import admin
from django.contrib.flatpages import views


admin.autodiscover()


rest_urlpatterns = [
    url(r'^rest/', include('edd.rest.urls', namespace='rest')),
    url(r'^rest/auth/', include('rest_framework.urls', namespace='rest_framework')),
]

urlpatterns = [
    url(r'^admin/', include(admin.site.urls)),
    url(r'^', include('main.urls', namespace='main')),
    url(r'^accounts/', include('allauth.urls')),  # allauth does not support namespacing
    url(r'^messages/', include('messages_extends.urls')),
    url(r'^utilities/', include('edd_utils.urls', namespace='edd_utils')),
    url(r'^profile/', include('edd.profile.urls', namespace='profile')),
    url(r'^pages/(?P<url>.*)/', views.flatpage, name='flatpage'),
] + static.static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.PUBLISH_REST_API:
    urlpatterns += rest_urlpatterns

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [
        url(r'^__debug__/', include(debug_toolbar.urls)),
    ]
