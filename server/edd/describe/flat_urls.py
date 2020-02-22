from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.describe"


urlpatterns = [
    path("help/", views.HelpView.as_view(), name="help"),
    path("ice_folder/", login_required(views.ICEFolderView.as_view()), name="folder"),
]
