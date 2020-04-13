from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.campaign"


urlpatterns = [
    path("campaign/", login_required(views.CampaignIndexView.as_view()), name="index"),
    path(
        "campaign/<int:page>/",
        login_required(views.CampaignIndexView.as_view()),
        name="index-paged",
    ),
    path(
        "c/<str:slug>/",
        login_required(views.CampaignDetailView.as_view()),
        name="detail",
    ),
    path(
        "c/<str:slug>/permissions/",
        login_required(views.CampaignPermissionView.as_view()),
        name="permission",
    ),
    path(
        "c/<str:slug>/page/<int:page>/",
        login_required(views.CampaignDetailView.as_view()),
        name="detail-paged",
    ),
]
