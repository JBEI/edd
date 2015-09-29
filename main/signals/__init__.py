import django.dispatch

study_modified = django.dispatch.Signal(providing_args=['study'])
study_removed = django.dispatch.Signal(providing_args=['study'])
user_modified = django.dispatch.Signal(providing_args=['user'])
