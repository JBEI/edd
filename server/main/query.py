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
    protocol = "https://"
    if current_request and not current_request.is_secure():
        protocol = "http://"
    return protocol + Site.objects.get_current().domain + relative_url


def get_edddata_study(study):
    """
    Dump of selected database contents used to populate EDDData object on the
    client. Although this includes some data types like Strain and CarbonSource
    that are not "children" of a Study, they have been filtered to include only
    those that are used by the given study.
    """

    # TODO: this is a lot of queries that are likely unnecessary; should look into removing

    metab_types = study.get_metabolite_types_used()
    gene_types = models.GeneIdentifier.objects.filter(
        assay__line__study=study
    ).distinct()
    protein_types = models.ProteinIdentifier.objects.filter(
        assay__line__study=study
    ).distinct()
    protocols = study.get_protocols_used()
    carbon_sources = models.CarbonSource.objects.filter(line__study=study).distinct()
    assays = study.get_assays().select_related(
        "line", "created__mod_by", "updated__mod_by"
    )
    # This could be nice, but slows down the query by an order of magnitude:
    #
    # from django.db.models import Case, Count, Value, When
    # …
    # assays = assays.annotate(
    #     metabolites=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementType.Group.METABOLITE,
    #         then=Value(1)))),
    #     transcripts=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementType.Group.GENEID,
    #         then=Value(1)))),
    #     proteins=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementType.Group.PROTEINID,
    #         then=Value(1)))),
    # )
    strains = study.get_strains_used()
    lines = (
        study.line_set.all()
        .select_related("created", "updated")
        .prefetch_related("carbon_source", "strains")
    )
    return {
        "currentStudyID": study.id,
        # measurement types
        "MetaboliteTypes": {mt.id: mt.to_json() for mt in metab_types},
        "GeneTypes": {gt.id: gt.to_json() for gt in gene_types},
        "ProteinTypes": {pt.id: pt.to_json() for pt in protein_types},
        # Protocols
        "Protocols": {p.id: p.to_json() for p in protocols},
        # Assays
        "Assays": {a.id: a.to_json() for a in assays},
        # Strains
        "Strains": {s.id: s.to_json() for s in strains},
        # Lines
        "Lines": {l.id: l.to_json() for l in lines},
        # Carbon sources
        "CSources": {cs.id: cs.to_json() for cs in carbon_sources},
    }


def get_edddata_misc():
    mdtypes = models.MetadataType.objects.all().select_related("group")
    unit_types = models.MeasurementUnit.objects.all()
    # TODO: find if any of these are still needed on front-end, could eliminate call
    return {
        # Measurement units
        "UnitTypes": {ut.id: ut.to_json() for ut in unit_types},
        # media types
        "MediaTypes": media_types,
        # Users
        "Users": get_edddata_users(),
        # Assay metadata
        "MetaDataTypes": {m.id: m.to_json() for m in mdtypes},
        # compartments
        "MeasurementTypeCompartments": models.Measurement.Compartment.to_json(),
    }


# TODO: eliminate uses of this data in front-end; should not be sending all user info
def get_edddata_users(active_only=False):
    User = auth.get_user_model()
    users = User.objects.select_related("userprofile").prefetch_related(
        "userprofile__institutions"
    )
    if active_only:
        users = users.filter(is_active=True)
    return {u.id: u.to_json() for u in users}
