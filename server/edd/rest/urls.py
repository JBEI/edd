from django.urls import include, path
from rest_framework_simplejwt import views as jwt

from . import routers, views

app_name = "edd.rest"


###################################################################################################
# Use routers & supporting frameworks to construct URL patterns
###################################################################################################
urlpatterns = [
    path(r"", include(routers.router.urls)),
    path(r"", include(routers.study_router.urls)),
    path(r"docs/", views.schema_view, name="docs"),
    path(r"token/", jwt.TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path(r"token/refresh/", jwt.TokenRefreshView.as_view(), name="token_refresh"),
    path(r"token/verify/", jwt.TokenVerifyView.as_view(), name="token_verify"),
]
