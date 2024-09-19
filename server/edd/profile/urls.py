from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.profile"


urlpatterns = [
    path("", login_required(views.ProfileView.as_view()), name="index"),
    path("~<str:username>/", login_required(views.ProfileView.as_view()), name="profile"),
    path("edit/", login_required(views.ProfileEdit.as_view()), name="edit"),
    path("~<str:username>/edit/", login_required(views.ProfileEdit.as_view()), name="pedit"),
    path("settings/", login_required(views.SettingsView.as_view()), name="settings"),
    path(
        "settings/<str:key>/",
        login_required(views.SettingsView.as_view()),
        name="settings_key",
    ),
    path("link/", login_required(views.AppLinkView.as_view()), name="applink"),
    path("link/<int:pk>/", login_required(views.SingleAppLinkView.as_view()), name="applink_edit"),
]
