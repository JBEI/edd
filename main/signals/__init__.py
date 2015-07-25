import django.dispatch

study_modified = django.dispatch.Signal(providing_args=['study'])
