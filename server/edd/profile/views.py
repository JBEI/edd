import json
import logging
from http import HTTPStatus

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.http import Http404, HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views import View
from django.views.generic.base import TemplateView

from edd import utilities

from . import forms, models

logger = logging.getLogger(__name__)


# /profile/ AND /profile/~<username>/
class ProfileView(TemplateView):
    template_name = "edd/profile/profile.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self._get_user(self.request, **kwargs)
        profile = user.profile
        institutions = profile.institutionid_set.select_related("institution")
        return {
            **context,
            "applinks": profile.applinks.all(),
            "link_form": forms.AddAppLinkForm(profile=user.profile),
            "institutions": institutions,
            "profile": profile,
            # note "profile_user" may not be same as request "user" added by Django
            "profile_user": user,
        }

    def _get_user(self, request, **kwargs):
        username = kwargs.get("username", None)
        if username is None:
            return request.user
        return get_object_or_404(get_user_model(), username=username)


# /profile/edit/ AND /profile/~<username>/edit/
class ProfileEdit(TemplateView):
    template_full = "edd/profile/profile-edit.html"
    template_inline = "edd/profile/profile-edit-inline.html"
    template_success = "edd/profile/profile-userinfo.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self._get_user(self.request, **kwargs)
        profile = user.profile
        form = forms.BasicProfileForm(instance=profile)
        return {
            **context,
            "edit_url": self.edit_url,
            "form": form,
            "profile": profile,
            "profile_user": user,
        }

    def get_template_names(self):
        if self.is_ajax():
            return [self.template_inline]
        return [self.template_full]

    def is_ajax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"

    def post(self, request, *args, **kwargs):
        user = self._get_user(request, **kwargs)
        form = forms.BasicProfileForm(data=request.POST, instance=user.profile)
        if form.is_valid():
            form.save()
            return self._respond_success()
        return self._respond_failure()

    def _get_user(self, request, **kwargs):
        username = kwargs.get("username", None)
        if username is None:
            self.base_url = reverse("profile:index")
            self.edit_url = reverse("profile:edit")
            return request.user
        elif request.user.is_superuser:
            self.base_url = reverse("profile:profile", kwargs=kwargs)
            self.edit_url = reverse("profile:pedit", kwargs=kwargs)
            return get_object_or_404(get_user_model(), username=username)
        raise Http404()

    def _respond(self, **kwargs):
        # mimic the .render_to_response() of TemplateView for POST responses
        return self.response_class(
            context=self.get_context_data(),
            request=self.request,
            using=self.template_engine,
            **kwargs,
        )

    def _respond_failure(self):
        if self.is_ajax():
            return self._respond(template=[self.template_inline], status=HTTPStatus.BAD_REQUEST)
        # not inline, so use messages framework to provide feedback after redirect
        messages.error(self.request, _("There was a problem updating the profile."))
        return HttpResponseRedirect(self.base_url)

    def _respond_success(self):
        if self.is_ajax():
            return self._respond(template=[self.template_success])
        return HttpResponseRedirect(self.base_url)


# /profile/settings/ AND /profile/settings/<key>/
class SettingsView(View):
    def get(self, request, *args, **kwargs):
        profile = request.user.profile
        key = kwargs.get("key", None)
        result = profile.preferences if key is None else profile.preferences.get(key, None)
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


# /profile/applinks/
class AppLinkView(TemplateView):
    template = "edd/profile/profile-applinks.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        return {
            **context,
            "applinks": self.request.user.profile.applinks.all(),
        }

    def is_ajax(self):
        return self.request.META.get("HTTP_X_REQUESTED_WITH", None) == "XMLHttpRequest"

    def post(self, request, *args, **kwargs):
        form = forms.AddAppLinkForm(data=request.POST, profile=request.user.profile)
        if form.is_valid():
            link = form.save()
            return self._respond_success(link)
        return self._respond_failure(form=form)

    def _respond_failure(self, form, **kwargs):
        if self.is_ajax():
            return self.response_class(
                context=self.get_context_data(link_form=form),
                request=self.request,
                template=[self.template],
                using=self.template_engine,
                **kwargs,
            )
        messages.error(self.request, _("There was a problem adding your application link."))
        return HttpResponseRedirect(reverse("profile:index"))

    def _respond_success(self, link, **kwargs):
        if self.is_ajax():
            next_form = forms.AddAppLinkForm(profile=self.request.user.profile)
            return self.response_class(
                context=self.get_context_data(link_form=next_form),
                request=self.request,
                template=[self.template],
                using=self.template_engine,
                **kwargs,
            )
        messages.success(self.request, _("Saved link to {url}").format(url=link.url))
        return HttpResponseRedirect(reverse("profile:index"))


class SingleAppLinkView(AppLinkView):
    http_method_names = ["options", "post"]
    template_name = "edd/profile/profile-applinks.html"

    def post(self, request, *args, **kwargs):
        key = kwargs.get("pk", None)
        profile = request.user.profile
        link = models.AppLink.objects.get(pk=key, profile=profile)
        # NOTE: form encoding will keep all numbers as strings
        match request.POST:
            case {"remove": _}:
                link.delete()
            case {"down": count}:
                self._reorder(key, profile, int(count))
            case {"up": count}:
                self._reorder(key, profile, -int(count))
            case _:
                logger.warning(f"Unknown command payload {request.POST}")
                return self._respond_failure()
        return self._respond_success()

    def _reorder(self, key, profile, count):
        order = list(profile.get_applink_order())
        old = order.index(key)
        index = max(0, old + count)
        order.pop(old)
        order.insert(index, key)
        profile.set_applink_order(order)

    def _respond_failure(self, **kwargs):
        messages.error(self.request, _("There was a problem updating your application links."))
        if self.is_ajax():
            return self.render_to_response(
                context=self.get_context_data(),
                status=HTTPStatus.BAD_REQUEST,
            )
        return HttpResponseRedirect(reverse("profile:index"))

    def _respond_success(self, **kwargs):
        if self.is_ajax():
            return self.render_to_response(context=self.get_context_data())
        messages.success(self.request, _("Updated your application links."))
        return HttpResponseRedirect(reverse("profile:index"))
