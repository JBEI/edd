from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.load"


urlpatterns = [
    path(
        "",
        login_required(views.ImportStartView.as_view()),
        name="start",
    ),
    # keeping the "wizard" URL in case someone happened to bookmark it
    path("wizard/", login_required(views.ImportStartView.as_view())),
    path(
        "<slug:uuid>/",
        login_required(views.ImportStartView.as_view()),
        name="start_edit",
    ),
    path(
        "<slug:uuid>/upload/",
        login_required(views.ImportUploadView.as_view()),
        name="upload",
    ),
    path(
        "<slug:uuid>/interpret/",
        login_required(views.ImportInterpretView.as_view()),
        name="interpret",
    ),
    path(
        "<slug:uuid>/interpret/<int:page>/",
        login_required(views.ImportInterpretView.as_view()),
        name="interpret-page",
    ),
    path(
        "<slug:uuid>/save/",
        login_required(views.ImportSaveView.as_view()),
        name="save",
    ),
]
