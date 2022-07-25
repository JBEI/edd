from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.search"


urlpatterns = [
    path("", login_required(views.search), name="search"),
    path("study/", login_required(views.study_search), name="study"),
    path("model/<slug:model>/", login_required(views.model_search), name="model"),
    path(
        "auto/",
        login_required(views.AutocompleteView.as_view()),
        name="autocomplete",
    ),
    path(
        "auto/<slug:model>/",
        login_required(views.AutocompleteView.as_view()),
        name="acmodel",
    ),
]
