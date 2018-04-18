from django.conf.urls import url
from django.contrib.auth.decorators import login_required

from . import views


app_name = 'edd.profile'

urlpatterns = [
    url(r'^$', login_required(views.index), name='index'),
    url(r'^~(?P<username>[\w.-]+)/$', login_required(views.profile), name='profile'),
    url(r'^settings/$', login_required(views.settings), name='settings'),
    url(r'^settings/(?P<key>[\w.-]+)$', login_required(views.settings_key), name='settings_key'),
]
