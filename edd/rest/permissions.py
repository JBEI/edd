"""
Defines classes that enforce EDD object permissions in the context of Django Rest Framework.
"""
from rest_framework.permissions import IsAuthenticated

from main.models import Study


class StudyResourcePermissions(IsAuthenticated):
    """
    A permissions class specifically for use in /rest/studies/, but NOT in nested resources.
    Checks if a user may create Study objects before allowing access.
    """
    def has_permission(self, request, view):
        result = super(StudyResourcePermissions, self).has_permission(request, view)
        if request.method == 'POST':
            return result and Study.user_can_create(request.user)
        return result
