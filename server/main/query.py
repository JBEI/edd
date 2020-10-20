import logging

from django.contrib import auth
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
    client. Although this includes some data types like Strain and CarbonSource
    that are not "children" of a Study, they have been filtered to include only
    those that are used by the given study.
    """
    measure_types = models.MeasurementType.objects.filter(
        assay__line__study=study
    ).distinct()
    protocols = study.get_protocols_used()
    assays = study.get_assays()
    strains = study.get_strains_used()
    lines = models.Line.objects.filter(study=study)
    User = auth.get_user_model()
    study_contact = User.profiles.filter(contact_study_set=study)
    line_contacts = User.profiles.filter(line_contact_set__study=study)
    line_experimenters = User.profiles.filter(line_experimenter_set__study=study)
    assay_experimenters = User.profiles.filter(assay_experimenter_set__study=study)
    all_users = study_contact.union(
        line_contacts, line_experimenters, assay_experimenters
    )
    return {
        "currentStudyID": study.id,
        "valueLinks": [
            reverse("main:measurements", kwargs={"slug": study.slug, "protocol": p.id})
            for p in protocols
        ],
        "Assays": {a.id: a.to_json() for a in assays},
        "Lines": {line.id: line.to_json() for line in lines},
        "MeasurementTypes": {t.id: t.to_json() for t in measure_types},
        "Protocols": {p.id: p.to_json() for p in protocols},
        "Strains": {s.id: s.to_json() for s in strains},
        "Users": {u.id: u.to_json() for u in all_users},
    }


def get_edddata_misc():
    mdtypes = models.MetadataType.objects.all().select_related("group")
    unit_types = models.MeasurementUnit.objects.all()
    return {
        "MeasurementTypeCompartments": models.Measurement.Compartment.to_json(),
        # TODO: is it necessary to always return full list?
        "MetaDataTypes": {m.id: m.to_json() for m in mdtypes},
        # TODO: is it necessary to always return full list?
        "UnitTypes": {ut.id: ut.to_json() for ut in unit_types},
    }
