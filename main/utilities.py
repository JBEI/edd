# coding: utf-8
from __future__ import unicode_literals

import json
import re

from builtins import str
from collections import defaultdict, Iterable
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.sites.models import Site
from django.db.models import Aggregate
from django.db.models.aggregates import Aggregate as SQLAggregate
from six import string_types
from threadlocals.threadlocals import get_current_request
from uuid import UUID

from .models import (
    CarbonSource, GeneIdentifier, MeasurementUnit, Metabolite, MetadataType, ProteinIdentifier,
    Strain,
)


class JSONDecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        elif isinstance(o, UUID):
            return str(o)
        return super(JSONDecimalEncoder, self).default(o)


class SQLArrayAgg(SQLAggregate):
    sql_function = 'array_agg'


class ArrayAgg(Aggregate):
    name = 'ArrayAgg'

    def add_to_query(self, query, alias, col, source, is_summary):
        query.aggregates[alias] = SQLArrayAgg(
            col, source=source, is_summary=is_summary, **self.extra
        )

media_types = {
    '--': '-- (No base media used)',
    'LB': 'LB (Luria-Bertani Broth)',
    'TB': 'TB (Terrific Broth)',
    'M9': 'M9 (M9 salts minimal media)',
    'EZ': 'EZ (EZ Rich)',
}


def flatten_json(source):
    """ Takes a json-shaped input (usually a dict), and flattens any nested dict, list, or tuple
        with dotted key names. """
    # TODO: test this!
    output = defaultdict(lambda: '')
    # convert lists/tuples to a dict
    if not isinstance(source, dict) and isinstance(source, Iterable):
        source = dict(enumerate(source))
    for key, value in source.iteritems():
        key = str(key)
        if isinstance(value, string_types):
            output[key] = value
        elif isinstance(value, (dict, Iterable)):
            for sub, item in flatten_json(value).iteritems():
                output['.'.join((key, sub, ))] = item
        else:
            output[key] = value
    return output


def get_edddata_study(study):
    """ Dump of selected database contents used to populate EDDData object on the client.
        Although this includes some data types like Strain and CarbonSource that are not
        "children" of a Study, they have been filtered to include only those that are used by
        the given study. """

    metab_types = study.get_metabolite_types_used()
    gene_types = GeneIdentifier.objects.filter(assay__line__study=study).distinct()
    protein_types = ProteinIdentifier.objects.filter(assay__line__study=study).distinct()
    protocols = study.get_protocols_used()
    carbon_sources = CarbonSource.objects.filter(line__study=study).distinct()
    assays = study.get_assays().select_related(
        'line__name', 'created__mod_by', 'updated__mod_by',
    )
    # This could be nice, but slows down the query by an order of magnitude:
    #
    # from django.db.models import Case, Count, Value, When
    # …
    # assays = assays.annotate(
    #     metabolites=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementGroup.METABOLITE,
    #         then=Value(1)))),
    #     transcripts=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementGroup.GENEID,
    #         then=Value(1)))),
    #     proteins=Count(Case(When(
    #         measurement__measurement_type__type_group=MeasurementGroup.PROTEINID,
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
    # XXX should these be stored elsewhere (postgres, other module)?
    measurement_compartments = {i: comp for i, comp in enumerate([
        {"name": "", "sn": ""},
        {"name": "Intracellular/Cytosol (Cy)", "sn": "IC"},
        {"name": "Extracellular", "sn": "EC"},
    ])}
    users = get_edddata_users()
    mdtypes = MetadataType.objects.all().select_related('group')
    unit_types = MeasurementUnit.objects.all()
    return {
        # Measurement units
        "UnitTypes": {ut.id: ut.to_json() for ut in unit_types},
        # media types
        "MediaTypes": media_types,
        # Users
        "Users": users,
        # Assay metadata
        "MetaDataTypes": {m.id: m.to_json() for m in mdtypes},
        # compartments
        "MeasurementTypeCompartments": measurement_compartments,
    }


def get_edddata_carbon_sources():
    """All available CarbonSource records."""
    carbon_sources = CarbonSource.objects.all()
    return {
        "MediaTypes": media_types,
        "CSourceIDs": [cs.id for cs in carbon_sources],
        "EnabledCSourceIDs": [cs.id for cs in carbon_sources if cs.active],
        "CSources": {cs.id: cs.to_json() for cs in carbon_sources},
    }


# TODO unit test
def get_edddata_measurement():
    """All data not associated with a study or related objects."""
    metab_types = Metabolite.objects.all()
    return {
        "MetaboliteTypeIDs": [mt.id for mt in metab_types],
        "MetaboliteTypes": {mt.id: mt.to_json() for mt in metab_types},
    }


def get_edddata_strains():
    strains = Strain.objects.all().select_related("created", "updated")
    return {
        "StrainIDs": [s.id for s in strains],
        "EnabledStrainIDs": [s.id for s in strains if s.active],
        "Strains": {s.id: s.to_json() for s in strains},
    }


def get_edddata_users(active_only=False):
    User = get_user_model()
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
    import numpy  # Nat mentioned delayed loading of numpy due to wierd startup interactions
    data = [md for md in measurement_data if len(md.x) and md.x[0] is not None]
    data.sort(key=lambda a: a.x[0])
    if len(data) == 0:
        raise ValueError("Can't interpolate because no valid measurement data are present.")
    xp = numpy.array([float(d.x[0]) for d in data])
    if not (xp[0] <= x <= xp[-1]):
        return None
    fp = numpy.array([float(d.y[0]) for d in data])
    return numpy.interp(float(x), xp, fp)


def extract_id_list(form, key):
    """
    Given a form parameter, extract the list of unique IDs that it specifies.
    Both multiple key-value pairs (someIDs=1&someIDs=2) and comma-separated
    lists (someIDs=1,2) are supported.
    """
    param = form[key]
    if isinstance(param, string_types):
        return param.split(",")
    else:
        ids = []
        for item in param:
            ids.extend(item.split(","))
        return ids


def extract_id_list_as_form_keys(form, prefix):
    """
    Extract unique IDs embedded in parameter keys, e.g. "prefix123include=1".
    """
    re_str = "^(%s)([0-9]+)include$" % prefix
    ids = []
    for key in form:
        m = re.match(re_str, key)
        if m is not None and form.get(key, "0") not in ["0", ""]:
            ids.append(m.group(2))  # e.g. "123"
    return ids


def get_selected_lines(form, study):
    selected_line_ids = []
    if "selectedLineIDs" in form:
        selected_line_ids = extract_id_list(form, "selectedLineIDs")
    else:
        selected_line_ids = extract_id_list_as_form_keys(form, "line")
    if len(selected_line_ids) == 0:
        return list(study.line_set.all())
    else:
        return study.line_set.filter(id__in=selected_line_ids)


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

extensions_to_icons = {
    '.zip':  'icon-zip.png',
    '.gzip': 'icon-zip.png',
    '.bzip': 'icon-zip.png',
    '.gz':   'icon-zip.png',
    '.dmg':  'icon-zip.png',
    '.rar':  'icon-zip.png',

    '.ico':  'icon-image.gif',
    '.gif':  'icon-image.gif',
    '.jpg':  'icon-image.gif',
    '.jpeg': 'icon-image.gif',
    '.png':  'icon-image.gif',
    '.tif':  'icon-image.gif',
    '.tiff': 'icon-image.gif',
    '.psd':  'icon-image.gif',
    '.svg':  'icon-image.gif',

    '.mov':  'icon-video.png',
    '.avi':  'icon-video.png',
    '.mkv':  'icon-video.png',

    '.txt':  'icon-text.png',
    '.rtf':  'icon-text.png',
    '.wri':  'icon-text.png',
    '.htm':  'icon-text.png',
    '.html': 'icon-text.png',

    '.pdf':  'icon-pdf.gif',
    '.ps':   'icon-pdf.gif',

    '.key':  'icon-keynote.gif',
    '.mdb':  'icon-mdb.png',
    '.doc':  'icon-word.png',
    '.ppt':  'icon-ppt.gif',
    '.xls':  'icon-excel.png',
    '.xlsx': 'icon-excel.png',
}
