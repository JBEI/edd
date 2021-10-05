from django.urls import include, path
from rest_framework_simplejwt import views as jwt

from . import routers, views

app_name = "edd.rest"


###################################################################################################
# Use routers & supporting frameworks to construct URL patterns
###################################################################################################
urlpatterns = [
    path("", include(routers.router.urls)),
    path("", include(routers.study_router.urls)),
    path("docs/", views.schema_view.with_ui("swagger", cache_timeout=0), name="docs"),
    path(
        "redoc/",
        views.schema_view.with_ui("redoc", cache_timeout=0),
        name="docs-redoc",
    ),
    path("token/", jwt.TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", jwt.TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", jwt.TokenVerifyView.as_view(), name="token_verify"),
]
