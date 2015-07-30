from django.conf import settings
from django.conf.urls import patterns, include, url, static
from django.contrib import admin

admin.autodiscover()

urlpatterns = patterns('',
    # Examples:
    # url(r'^$', 'edd.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^admin/', include(admin.site.urls)),
    url(r'^', include('main.urls', namespace='main')),
    url(r'^accounts/', include('django.contrib.auth.urls')),
    url(r'^utilities/', include('edd_utils.urls', namespace='edd_utils')),
    url(r'^profile/', include('edd.profile.urls', namespace='profile')),
) + static.static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
