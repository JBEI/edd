from django.apps import AppConfig


class LoadConfig(AppConfig):
    label = "load"
    name = "edd.load"
    verbose_name = "Data Loading"

    def ready(self):
        # The F401 error code is "imported but unused" warning;
        # we ignore it here because we're purposefully importing unused modules
        # to make certain signal handlers are defined at the correct time

        # make sure to load/register all the signal handlers
        from . import signals  # noqa: F401
        from . import reporting  # noqa: F401

        # plug into the REST API
        from .rest import views
        from edd.rest.routers import router, study_router

        study_router.register(r"load", views.LoadRequestViewSet, basename="study_load")
        router.register(
            r"load_categories", views.CategoriesViewSet, basename="load_categories"
        )
