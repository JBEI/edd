# coding: utf-8

import json

from django.contrib.auth import get_user_model
from django.http import (
    Http404, HttpResponse, HttpResponseNotAllowed, JsonResponse
)
from django.shortcuts import render
from django.template import RequestContext

# /profile/
def index(request):
    return profile_for_user(request, request.user)

# /profile/~<username>/
def profile(request, username):
    User = get_user_model()
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist as e:
        raise Http404("User does not exist")
    return profile_for_user(request, user)

def profile_for_user(request, user):
    context = {
        'profile_user': user,
        'profile': user.profile,
    }
    return render(
        request,
        "edd/profile/profile.html",
        context=context,
    )

# /profile/settings/
def settings(request):
    user = request.user
    if hasattr(user, 'profile'):
        if request.method == 'HEAD':
            return HttpResponse(status=200)
        elif request.method == 'GET':
            return JsonResponse(user.profile.prefs or {})
        elif request.method == 'PUT' or request.method == 'POST':
            try:
                user.profile.prefs = json.loads(request.POST['data'])
                user.profile.save()
                return HttpResponse(status=204)
            except Exception as e:
                # TODO: logging
                return HttpResponse(status=500)
        elif request.method == 'DELETE':
            try:
                user.profile.prefs = {}
                user.profile.save()
                return HttpResponse(status=204)
            except Exception as e:
                # TODO: logging
                return HttpResponse(status=500)
        else:
            return HttpResponseNotAllowed(['HEAD', 'GET', 'PUT', 'POST', 'DELETE', ])
    raise Http404("Could not find user settings")

# /profile/settings/<key>
def settings_key(request, key):
    user = request.user
    if hasattr(user, 'profile'):
        prefs = user.profile.prefs
        if request.method == 'HEAD':
            return HttpResponse(status=200)
        elif request.method == 'GET':
            return JsonResponse(prefs.get(key, None), safe=False)
        elif request.method == 'PUT' or request.method == 'POST':
            try:
                prefs.update({ key: request.POST['data'], })
                user.profile.save()
                return HttpResponse(status=204)
            except Exception as e:
                # TODO: logging
                return HttpResponse(status=500)
        elif request.method == 'DELETE':
            try:
                del prefs[key]
                user.profile.save()
                return HttpResponse(status=204)
            except Exception as e:
                # TODO: logging
                return HttpResponse(status=500)
        else:
            return HttpResponseNotAllowed(['HEAD', 'GET', 'PUT', 'POST', 'DELETE', ])
    raise Http404("Could not find user settings")
