# coding: utf-8

from collections import defaultdict, Iterable
from django.conf import settings
from django.contrib import auth
from django.contrib.sites.models import Site
from future.utils import viewitems
from six import string_types
from threadlocals.threadlocals import get_current_request

from . import models

import logging

logger = logging.getLogger(__name__)


class EDDSettingsMiddleware(object):
    """ Adds an `edd_deployment` attribute to requests passing through the middleware with a value
        of the current deployment environment. """
    def process_request(self, request):
        request.edd_deployment = settings.EDD_DEPLOYMENT_ENVIRONMENT


media_types = {
    '--': '-- (No base media used)',
    'LB': 'LB (Luria-Bertani Broth)',
    'TB': 'TB (Terrific Broth)',
    'M9': 'M9 (M9 salts minimal media)',
    'EZ': 'EZ (EZ Rich)',
}


def flatten_json(source):
    """
    Takes a json-shaped input (usually a dict), and flattens any nested dict, list, or tuple
    with dotted key names.
    """
    # TODO: test this!
    output = defaultdict(lambda: '')
    # convert lists/tuples to a dict
    if not isinstance(source, dict) and isinstance(source, Iterable):
        source = dict(enumerate(source))
    for key, value in viewitems(source):
        key = str(key)
        if isinstance(value, string_types):
            output[key] = value
        elif isinstance(value, (dict, Iterable)):
            for sub, item in viewitems(flatten_json(value)):
                output['.'.join((key, sub, ))] = item
        else:
            output[key] = value
    return output


def get_edddata_study(study):
    """
    Dump of selected database contents used to populate EDDData object on the client.
    Although this includes some data types like Strain and CarbonSource that are not
    "children" of a Study, they have been filtered to include only those that are used by
    the given study.
    """

    # TODO: this is a lot of queries that are likely unnecessary; should look into removing

    metab_types = study.get_metabolite_types_used()
    gene_types = models.GeneIdentifier.objects.filter(assay__line__study=study).distinct()
    protein_types = models.ProteinIdentifier.objects.filter(assay__line__study=study).distinct()
    protocols = study.get_protocols_used()
    carbon_sources = models.CarbonSource.objects.filter(line__study=study).distinct()
    assays = study.get_assays().select_related('line', 'created__mod_by', 'updated__mod_by')
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
    lines = study.line_set.all().select_related(
        'created', 'updated',
    ).prefetch_related(
        'carbon_source', 'strains',
    )
    return {
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
    mdtypes = models.MetadataType.objects.all().select_related('group')
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
    users = User.objects.select_related(
        'userprofile'
    ).prefetch_related(
        'userprofile__institutions'
    )
    if active_only:
        users = users.filter(is_active=True)
    return {u.id: u.to_json() for u in users}


def interpolate_at(measurement_data, x):
    """
    Given an X-value without a measurement, use linear interpolation to
    compute an approximate Y-value based on adjacent measurements (if any).
    """
    import numpy  # Nat mentioned delayed loading of numpy due to weird startup interactions
    data = [md for md in measurement_data if len(md.x) and md.x[0] is not None]
    data.sort(key=lambda a: a.x[0])
    if len(data) == 0:
        raise ValueError("Can't interpolate because no valid measurement data are present.")
    xp = numpy.array([float(d.x[0]) for d in data])
    if not (xp[0] <= x <= xp[-1]):
        return None
    fp = numpy.array([float(d.y[0]) for d in data])
    return numpy.interp(float(x), xp, fp)


def get_absolute_url(relative_url):
    """
    Computes the absolute URL for the specified relative URL.
    :param relative_url: the relative URL
    :return: the absolute URL
    """
    current_request = get_current_request()
    protocol = 'https://'
    if current_request and not current_request.is_secure():
        protocol = 'http://'
    return protocol + Site.objects.get_current().domain + relative_url
