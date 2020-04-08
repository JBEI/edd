from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.load"


urlpatterns = [
    path("", login_required(views.ImportTableView.as_view()), name="table"),
    path("wizard/", login_required(views.ImportView.as_view()), name="wizard"),
]
