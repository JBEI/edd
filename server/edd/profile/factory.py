import factory
from django.contrib.auth import get_user_model
from django.contrib.auth import models as auth_models


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
        django_get_or_create = ("username",)

    username = factory.Faker("user_name")
    email = factory.Faker("safe_email")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")

    @factory.post_generation
    def profile(self, create, extracted, **kwargs):
        if create:
            self.save()
            # force evaluation of profile attribute
            self.profile


class GroupFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = auth_models.Group
        django_get_or_create = ("name",)

    name = factory.Faker("word")
