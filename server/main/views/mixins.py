"""View mixins for core EDD records."""

import logging

from django.core.exceptions import PermissionDenied
from django.utils.translation import gettext as _
from django.views import generic

from .. import models, redis

logger = logging.getLogger(__name__)


class StudyObjectMixin(generic.detail.SingleObjectMixin):
    """Mixin class to add to Study views."""

    model = models.Study

    def check_write_permission(self, request):
        if not self.get_object().user_can_write(request.user):
            raise PermissionDenied(
                _("You do not have permission to modify this study.")
            )

    def get_context_data(self, **kwargs):
        study = self.get_object()
        lvs = redis.LatestViewedStudies(self.request.user)
        lvs.viewed_study(study)
        return super().get_context_data(
            has_assays=study.assay_set.filter(active=True).exists(),
            has_lines=study.line_set.filter(active=True).exists(),
            writable=study.user_can_write(self.request.user),
            **kwargs,
        )

    def get_object(self, queryset=None):
        """Overrides the base method to curry if there is no filtering queryset."""
        # already looked up object and no filter needed, return previous object
        if hasattr(self, "object") and queryset is None:
            return self.object
        # call parents
        obj = super().get_object(queryset)
        # save parents result if no filtering queryset
        if queryset is None:
            self.object = obj
        return obj

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_superuser:
            return qs
        access = models.Study.access_filter(self.request.user)
        return qs.filter(access, active=True).distinct()
