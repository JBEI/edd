"""
Defines classes that enforce EDD object permissions in the context of Django Rest Framework.
"""
from rest_framework import permissions

from main import models


class StudyResourcePermissions(permissions.IsAuthenticated):
    """
    A permissions class specifically for use in /rest/studies/.
    Checks if a user may create Study objects before allowing access.
    """

    def has_permission(self, request, view):
        result = super().has_permission(request, view)
        if request.method not in permissions.SAFE_METHODS:
            return result and models.Study.user_can_create(request.user)
        return result

    def has_object_permission(self, request, view, obj):
        result = super().has_object_permission(request, view, obj)
        access = models.Study.access_filter(
            request.user, access=models.StudyPermission.CAN_VIEW
        )
        if request.method not in permissions.SAFE_METHODS:
            access = models.Study.access_filter(
                request.user, access=models.StudyPermission.CAN_EDIT
            )
        return result and models.Study.objects.filter(access, id=obj.pk).exists()
