import logging

from django.contrib.sites.models import Site
from django.urls import reverse
from threadlocals.threadlocals import get_current_request

from . import models

__doc__ = """
This module contains utility methods that make use of the database layer.

Keeping utility methods at higher and lower levels of abstraction separated
avoids issues with circular dependencies, if model/database layer code attempts
to access low-level utility methods.
"""

logger = logging.getLogger(__name__)


media_types = {
    "--": "-- (No base media used)",
    "LB": "LB (Luria-Bertani Broth)",
    "TB": "TB (Terrific Broth)",
    "M9": "M9 (M9 salts minimal media)",
    "EZ": "EZ (EZ Rich)",
}


def build_study_url(slug):
    """
    Constructs an absolute URL (e.g. https://example.com/edd/s/my-study/) for a
    study from a slug.
    """
    path = reverse("main:overview", kwargs={"slug": slug})
    return get_absolute_url(path)


def get_absolute_url(relative_url):
    """
    Computes the absolute URL for the specified relative URL.

    :param relative_url: the relative URL
    :return: the absolute URL
    """
    current_request = get_current_request()
    site = Site.objects.get_current()
    protocol = "https"
    if current_request and not current_request.is_secure():
        protocol = "http"
    return f"{protocol}://{site.domain}{relative_url}"


def get_edddata_study(study):
    """
    Dump of selected database contents used to populate EDDData object on the
    client. Deprecated, use REST API instead.
    """
    assays = study.get_assays()
    lines = models.Line.objects.filter(study=study)

    return {
        "currentStudyID": study.id,
        "Assays": {a.id: a.to_json() for a in assays},
        "Lines": {line.id: line.to_json() for line in lines},
    }
