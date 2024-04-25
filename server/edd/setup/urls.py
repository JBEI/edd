from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.setup"


urlpatterns = [
    path(
        "",
        login_required(views.SetupUploadView.as_view()),
        name="start",
    ),
    path(
        "<slug:uuid>/",
        login_required(views.SetupInterpretView.as_view()),
        name="interpret",
    ),
    path(
        "<slug:uuid>/<int:page>/",
        login_required(views.SetupInterpretView.as_view()),
        name="interpret-page",
    ),
    path(
        "<slug:uuid>/save/",
        login_required(views.SetupSaveView.as_view()),
        name="save",
    ),
]
