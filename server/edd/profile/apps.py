from django.apps import AppConfig


class ProfileConfig(AppConfig):
    label = "profile"
    name = "edd.profile"
    verbose_name = "User Profiles"

    def ready(self):
        from django.contrib.auth import get_user_model

        from .models import patch_user_model

        # before loading anything else, add our patches to the User object
        patch_user_model(get_user_model())
