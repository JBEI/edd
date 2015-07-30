import json

from django.contrib.auth import get_user_model
from django.http import (
    Http404, HttpResponse, HttpResponseNotAllowed, JsonResponse
)
from django.shortcuts import render, render_to_response
from django.template import RequestContext

def index(request):
    return profile(request, request.user.username)

def profile(request, username):
    User = get_user_model()
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist, e:
        raise Http404("User does not exist")
    return render_to_response("edd/profile/profile.html",
        dictionary={ 'profile_user': user, 'profile': user.userprofile, },
        context_instance=RequestContext(request),
        )

def settings(request):
    user = request.user
    if hasattr(user, 'userprofile'):
        if request.method == 'HEAD':
            return HttpResponse(status=200)
        elif request.method == 'GET':
            return JsonResponse(user.userprofile.prefs or {})
        elif request.method == 'PUT' or request.method == 'POST':
            try:
                user.userprofile.prefs = json.loads(request.POST['data'])
                user.userprofile.save()
                return HttpResponse(status=204)
            except Exception, e:
                # TODO: logging
                return HttpResponse(status=500)
        elif request.method == 'DELETE':
            try:
                user.userprofile.prefs = {}
                user.userprofile.save()
                return HttpResponse(status=204)
            except Exception, e:
                # TODO: logging
                return HttpResponse(status=500)
        else:
            return HttpResponseNotAllowed(['HEAD', 'GET', 'PUT', 'POST', 'DELETE', ])
    raise Http404("Could not find user settings")

def settings_key(request, key):
    user = request.user
    if hasattr(user, 'userprofile'):
        prefs = user.userprofile.prefs
        if request.method == 'HEAD':
            return HttpResponse(status=200)
        elif request.method == 'GET':
            return JsonResponse(prefs.get(key, None), safe=False)
        elif request.method == 'PUT' or request.method == 'POST':
            try:
                prefs.update({ key: request.POST['data'], })
                user.userprofile.save()
                return HttpResponse(status=204)
            except Exception, e:
                # TODO: logging
                return HttpResponse(status=500)
        elif request.method == 'DELETE':
            try:
                del prefs[key]
                user.userprofile.save()
                return HttpResponse(status=204)
            except Exception, e:
                # TODO: logging
                return HttpResponse(status=500)
        else:
            return HttpResponseNotAllowed(['HEAD', 'GET', 'PUT', 'POST', 'DELETE', ])
    raise Http404("Could not find user settings")
