from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.export"


urlpatterns = [
    # "export" URLs
    path("table/", login_required(views.ExportView.as_view()), name="export"),
    path("worklist/", login_required(views.WorklistView.as_view()), name="worklist"),
    path("sbml/", login_required(views.SbmlView.as_view()), name="sbml"),
]
