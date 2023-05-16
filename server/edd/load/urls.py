from django.contrib.auth.decorators import login_required
from django.urls import path

from . import views

app_name = "edd.load"


urlpatterns = [
    path("", login_required(views.ImportTableView.as_view()), name="table"),
    path("wizard/", login_required(views.ImportView.as_view()), name="wizard"),
]


def register_rest_api_calls():
    # plug into the REST API
    from edd.rest.routers import router, study_router

    from .rest import views as rest_views

    study_router.register(
        r"load",
        rest_views.LoadRequestViewSet,
        basename="study_load",
    )
    router.register(
        r"load_categories",
        rest_views.CategoriesViewSet,
        basename="load_categories",
    )
