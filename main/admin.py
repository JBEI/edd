from django.contrib import admin
from django.utils import timezone
from main.models import Protocol, Update


class ProtocolAdmin(admin.ModelAdmin):
    fields = ['protocol_name', 'description', 'active', 'variant_of']

    def save_model(self, request, obj, form, change):
        update = Update.load_request_update(request)
        if not change:
            obj.created = update
            obj.owned_by = request.user
        obj.updated = update
        obj.save()

admin.site.register(Protocol, ProtocolAdmin)

