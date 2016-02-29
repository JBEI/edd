from django.conf import settings
from django.conf.urls import include, url, static
from django.contrib import admin
from django.conf import settings

admin.autodiscover()

urlpatterns = [
    # Examples:
    # url(r'^$', 'edd.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^admin/', include(admin.site.urls)),
    url(r'^', include('main.urls', namespace='main')),
    # url(r'^accounts/', include('django.contrib.auth.urls', namespace='auth')),
    url(r'^accounts/', include('allauth.urls')),  # allauth does not support namespacing
    url(r'^utilities/', include('edd_utils.urls', namespace='edd_utils')),
    url(r'^profile/', include('edd.profile.urls', namespace='profile')),
] + static.static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.PUBLISH_REST_API:
    urlpatterns.append(url(r'^rest/', include('edd.rest.urls', namespace='rest')))
    urlpatterns.append(url(r'^rest/auth/', include('rest_framework.urls',
                               namespace='rest_framework')))
