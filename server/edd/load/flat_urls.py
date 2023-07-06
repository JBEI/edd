from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.load"


urlpatterns = [
    path("help/", login_required(views.ImportHelpView.as_view()), name="wizard_help"),
]
