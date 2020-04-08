from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.load"


urlpatterns = [
    path("parse/", login_required(views.utilities_parse_import_file), name="parse"),
    path("help/", login_required(views.ImportHelpView.as_view()), name="wizard_help"),
]
