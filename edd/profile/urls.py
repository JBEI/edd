# -*- coding: utf-8 -*-

from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views


app_name = 'edd.profile'


urlpatterns = [
    path('', login_required(views.index), name='index'),
    path('~<str:username>/', login_required(views.profile), name='profile'),
    path('settings/', login_required(views.settings), name='settings'),
    path('settings/<str:key>/', login_required(views.settings_key), name='settings_key'),
]
