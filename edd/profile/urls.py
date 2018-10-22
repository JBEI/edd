# -*- coding: utf-8 -*-

from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views


app_name = 'edd.profile'


urlpatterns = [
    path('', login_required(views.ProfileView.as_view()), name='index'),
    path('~<str:username>/', login_required(views.ProfileView.as_view()), name='profile'),
    path('settings/', login_required(views.SettingsView.as_view()), name='settings'),
    path('settings/<str:key>/', login_required(views.SettingsView.as_view()), name='settings_key'),
]
