import json
from http import HTTPStatus

from django.contrib.auth import get_user_model
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views import View
from django.views.generic.base import TemplateView

from edd import utilities


# /profile/ AND /profile/~<username>/
class ProfileView(TemplateView):
    template_name = "edd/profile/profile.html"

    def get_context_data(self, **kwargs):
        user = self._get_user(self.request, **kwargs)
        profile = user.profile
        institutions = profile.institutionid_set.select_related("institution")
        return {
            "institutions": institutions.order_by("sort_key"),
            "profile_user": user,
            "profile": profile,
        }

    def _get_user(self, request, **kwargs):
        username = kwargs.get("username", None)
        if username is None:
            return request.user
        return get_object_or_404(get_user_model(), username=username)


# /profile/settings/ AND /profile/settings/<key>/
class SettingsView(View):
    def get(self, request, *args, **kwargs):
        profile = request.user.profile
        key = kwargs.get("key", None)
        result = (
            profile.preferences if key is None else profile.preferences.get(key, None)
        )
        return JsonResponse(result, encoder=utilities.JSONEncoder, safe=False)

    def post(self, request, *args, **kwargs):
        profile = request.user.profile
        key = kwargs.get("key", None)
        payload = json.loads(request.POST["data"], cls=utilities.JSONDecoder)
        if key is None:
            profile.preferences = payload
        else:
            profile.preferences.update({key: payload})
        profile.save()
        return HttpResponse(status=HTTPStatus.NO_CONTENT)

    # treat PUT the same as POST
    put = post

    def delete(self, request, *args, **kwargs):
        profile = request.user.profile
        key = kwargs.get("key", None)
        if key is None:
            profile.preferences = {}
        else:
            del profile.preferences[key]
        profile.save()
        return HttpResponse(status=HTTPStatus.NO_CONTENT)
