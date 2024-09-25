from django.urls import path

from . import consumers

app_name = "notify"

urlpatterns = [
    path("", consumers.NotifySubscribeConsumer.as_asgi(), name="messages"),
]
