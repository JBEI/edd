# coding: utf-8

from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views


app_name = "edd.campaign"


urlpatterns = [
    path("", login_required(views.CampaignIndexView.as_view()), name="index"),
    path(
        "<int:page>/",
        login_required(views.CampaignIndexView.as_view()),
        name="index-paged",
    ),
    path(
        "c/<str:slug>/",
        login_required(views.CampaignDetailView.as_view()),
        name="detail",
    ),
    path(
        "c/<str:slug>/list/",
        login_required(views.CampaignStudyListView.as_view()),
        name="study",
    ),
    path(
        "c/<str:slug>/list/<int:page>/",
        login_required(views.CampaignStudyListView.as_view()),
        name="study-paged",
    ),
]
