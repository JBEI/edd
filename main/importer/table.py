# coding: utf-8

import json
import logging
import re
import warnings

from celery import shared_task
from collections import namedtuple
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils.translation import ugettext as _
from future.utils import viewitems, viewvalues
from six import string_types

from .. import models


logger = logging.getLogger(__name__)
MType = namedtuple('MType', ['compartment', 'type', 'unit', ])
NO_TYPE = MType(models.Measurement.Compartment.UNKNOWN, None, None)


MODE_PROTEOMICS = 'pr'
MODE_SKYLINE = 'skyline'
MODE_TRANSCRIPTOMICS = 'tr'


@shared_task
def import_task(study_id, user_id, data):
    study = models.Study.objects.get(pk=study_id)
    user = get_user_model().objects.get(pk=user_id)
    try:
        importer = TableImport(study, user)
        (added, updated) = importer.import_data(data)
    except Exception as e:
        logger.exception('Failure in import_task: %s', e)
        raise RuntimeError(
            _('Failed import to %(study)s, EDD encountered this problem: %(problem)s') % {
                'problem': e,
                'study': study.name,
            }
        )
    return _(
        'Finished import to %(study)s: %(added)d added, %(updated)d updated measurements.' % {
            'added': added,
            'study': study.name,
            'updated': updated,
        }
    )


class TableImport(object):
    """ Object to handle processing of data POSTed to /study/{id}/import view and add
        measurements to the database. """

    def __init__(self, study, user, request=None):
        """
        Creates an import handler.
        :param study: the target study for import
        :param user: the user performing the import
        :param request: (optional) if provided, can add messages using Django messages framework
        :raises: PermissionDenied if the user does not have write access to the study
        """
        self._study = study
        self._user = user
        self._line_assay_lookup = {}
        self._line_lookup = {}
        self._meta_lookup = {}
        self._valid_protocol = {}
        self._request = request
        # end up looking for hours repeatedly, just load once at init
        self._hours = models.MeasurementUnit.objects.get(unit_name='hours')
        if not self._study.user_can_write(user):
            raise PermissionDenied(
                '%s does not have write access to study "%s"' % (user.username, study.name)
            )

    @transaction.atomic(savepoint=False)
    def import_data(self, data):
        """
        Performs the import
        :param data:
        :return:
        :raises: ValidationError if no data are provided to import
        """
        self._data = data
        series = json.loads(data.get('jsonoutput', '[]'))
        self.check_series_points(series)
        self.init_lines_and_assays(series)
        return self.create_measurements(series)

    def check_series_points(self, series):
        """
        Checks that each item in the series has some data or metadata, and sets a
        'nothing to import' value for the item if that's the case
         """
        for item in series:
            points = item.get('data', [])
            meta = item.get('metadata_by_id', {})
            for meta_id in meta:
                self._metatype(meta_id)  # don't care about return value here
            if len(points) == 0 and len(meta) == 0:
                item['nothing_to_import'] = True

    def init_lines_and_assays(self, series):
        """ Client-side code detects labels for assays/lines, and allows the user to select
            an "ID" for each label; these ids are passed along in each set and are used to resolve
            actual Line and Assay instances. """
        for item in series:
            item['assay_obj'] = self._init_item_assay(item)

    def _init_item_assay(self, item):
        assay = None
        assay_id = item.get('assay_id', None)
        assay_name = item.get('assay_name', None)
        if assay_id is None:
            logger.warning('Import set has undefined assay_id field.')
            item['invalid_fields'] = True
        elif assay_id not in ['new', 'named_or_new', ]:
            # attempt to lookup existing assay
            try:
                assay = models.Assay.objects.get(pk=assay_id, line__study_id=self._study.pk)
            except models.Assay.DoesNotExist:
                logger.warning(
                    'Import set cannot load Assay,Study: %(assay_id)s,%(study_id)s' % {
                        'assay_id': assay_id,
                        'study_id': self._study.pk,
                    }
                )
                item['invalid_fields'] = True
        else:
            # At this point we know we need to create an Assay, or reference one we created
            # earlier. The question is, for which Line and Protocol? Now protocol_id is essential,
            # so we check it.
            protocol = self._init_item_protocol(item)
            line = self._init_item_line(item)
            if protocol is None or line is None:
                pass  # already logged errors, move on
            else:
                if assay_name is None or assay_name.strip() == '':
                    # if we have no name, 'named_or_new' and 'new' are treated the same
                    index = line.new_assay_number(protocol)
                    assay_name = models.Assay.build_name(line, protocol, index)
                key = (line.id, assay_id)
                if key in self._line_assay_lookup:
                    assay = self._line_assay_lookup[key]
                else:
                    assay = line.assay_set.create(
                        name=assay_name,
                        protocol=protocol,
                        experimenter=self._user,
                    )
                    logger.info('Created new Assay %s:%s' % (assay.id, assay_name))
                    self._line_assay_lookup[key] = assay
        return assay

    def _init_item_line(self, item):
        line = None
        line_id = item.get('line_id', None)
        line_name = item.get('line_name', None)
        if line_id is None:
            logger.warning('Import set needs new Assay but has undefined line_id field.')
            item['invalid_fields'] = True
        elif line_id == 'new':
            # If the label is 'None' we attempt to locate (or if missing, create) a Line named
            # 'New Line'.
            # (If a user wants a new Line created but has not specified a name, it means we have
            # no way of distinguishing one new Line request in a multi-set import from any other.
            # So the only sane behavior is to place all the sets under one Line.)
            if line_name is None or line_name.strip() == '':
                line_name = _('New Line')
            if line_name in self._line_lookup:
                line = self._line_lookup[line_name]
            else:
                line = self._study.line_set.create(
                    name=line_name,
                    contact=self._user,
                    experimenter=self._user
                )
                self._line_lookup[line_name] = line
                logger.info('Created new Line %s:%s' % (line.id, line.name))
        else:
            try:
                line = models.Line.objects.get(pk=line_id, study_id=self._study.pk)
            except models.Line.DoesNotExist:
                logger.warning(
                    'Import set cannot load Line,Study: %(line_id)s,%(study_id)s' % {
                        'line_id': line_id,
                        'study_id': self._study.pk,
                    }
                )
                item['invalid_fields'] = True
        return line

    def _init_item_protocol(self, item):
        protocol_id = item.get('protocol_id', None)
        if protocol_id is None:
            logger.warning('Import set needs new Assay, but has undefined protocol_id field.')
            item['invalid_fields'] = True
        elif protocol_id not in self._valid_protocol:
            # when protocol ID valid, map to itself, otherwise map to None
            protocol = None
            try:
                protocol = models.Protocol.objects.get(pk=protocol_id)
            except models.Protocol.DoesNotExist:
                pass
            self._valid_protocol[protocol_id] = protocol
        result = self._valid_protocol.get(protocol_id, None)
        if result is None:
            logger.warning('Import set cannot load protocol %s' % (protocol_id))
            item['invalid_fields'] = True
        return result

    def create_measurements(self, series):
        added = 0
        updated = 0
        # TODO: During a standard-size biolector import (~50000 measurement values) this loop runs
        # very slowly on my test machine, consistently taking an entire second per set (approx 300
        # values each). To an end user, this makes the submission appear to hang for over a
        # minute, which might make them behave erratically...
        for (index, item) in enumerate(series):
            points = item.get('data', [])
            meta = item.get('metadata_by_id', {})
            if item.get('nothing_to_import', False):
                logger.warning('Skipped set %s because it has no data' % index)
            elif item.get('invalid_fields', False):
                logger.warning('Skipped set %s because it has invalid fields' % index)
            elif item.get('assay_obj', None) is None:
                logger.warning('Skipped set %s because no assay could be loaded' % index)
            else:
                assay = item['assay_obj']
                record = self._load_measurement_record(item)
                (points_added, points_updated) = self._process_measurement_points(record, points)
                added += points_added
                updated += points_updated
                self._process_metadata(assay, meta)
                # force refresh of Assay's Update (also saves any changed metadata)
                assay.save()
        for line in viewvalues(self._line_lookup):
            # force refresh of Update (also saves any changed metadata)
            line.save()
        self._study.save()
        return (added, updated)

    def _load_measurement_record(self, item):
        record = None
        assay = item['assay_obj']
        points = item.get('data', [])
        mtype = self._mtype(item)

        find = {
            "active": True,
            "compartment": mtype.compartment,
            "measurement_type_id": mtype.type,
            "measurement_format": self._mtype_guess_format(points),
            "x_units": self._hours,
            "y_units_id": mtype.unit,
        }
        logger.info('Finding measurements for %s', find)
        records = assay.measurement_set.filter(**find)

        if records.count() > 0:
            if self._replace():
                records.delete()
            else:
                record = records[0]
                record.save()  # force refresh of Update
        if record is None:
            find.update(experimenter=self._user)
            logger.debug("Creating measurement with: %s", find)
            record = assay.measurement_set.create(**find)
        return record

    def _process_measurement_points(self, record, points):
        added = 0
        updated = 0
        for x, y in points:
            (xvalue, yvalue) = (self._extract_value(x), self._extract_value(y))
            updated += record.measurementvalue_set.filter(x=xvalue).update(y=yvalue)
            if updated == 0:
                record.measurementvalue_set.create(x=xvalue, y=yvalue)
                added += 1
        return (added, updated)

    def _process_metadata(self, assay, meta):
        if len(meta) > 0:
            if self._replace():
                # would be simpler to do assay.meta_store.clear()
                # but we only want to replace types included in import data
                for label, metatype in viewitems(self._meta_lookup):
                    if metatype.pk in assay.meta_store:
                        del assay.meta_store[metatype.pk]
                    elif metatype.pk in assay.line.meta_store:
                        del assay.line.meta_store[metatype.pk]
            for meta_id, value in meta.items():
                metatype = self._metatype(meta_id)
                if metatype is not None:
                    if metatype.for_line():
                        assay.line.meta_store[metatype.pk] = value
                    elif metatype.for_protocol():
                        assay.meta_store[metatype.pk] = value

    def _extract_value(self, value):
        # make sure input is string first, split on slash or colon, and give back array of numbers
        try:
            return list(map(float, re.split('/|:', ('%s' % value).replace(',', ''))))
        except ValueError:
            warnings.warn('Value %s could not be interpreted as a number' % value)
        return []

    def _load_compartment(self, item):
        compartment = item.get('compartment_id', None)
        if not compartment:
            compartment = self._data.get('masterMCompValue', None)
            # master value could be set to null, want to still default to UNKNOWN
            if not compartment:
                compartment = models.Measurement.Compartment.UNKNOWN
        return compartment

    def _load_hint(self, item):
        mode = self._mode()
        hint = item.get('hint', None)
        if hint:
            return hint
        return mode

    def _load_type_id(self, item):
        type_id = item.get('measurement_id', None)
        if type_id is None:
            type_id = self._data.get('masterMTypeValue', None)
        return type_id

    def _load_unit(self, item):
        unit = item.get('units_id', None)
        if not unit:
            unit = self._data.get('masterMUnitsValue', None)
            # TODO: get rid of magic number fallback; every EDD will have n/a as Unit #1?
            if not unit:
                unit = 1
        return unit

    def _mode(self):
        return self._data.get('datalayout', None)

    def _metatype(self, meta_id):
        if meta_id not in self._meta_lookup:
            try:
                self._meta_lookup[meta_id] = models.MetadataType.objects.get(pk=meta_id)
            except models.MetadataType.DoesNotExist:
                logger.warning('No MetadataType found for %s' % meta_id)
        return self._meta_lookup.get(meta_id, None)

    def _mtype(self, item):
        """
        Attempts to infer the measurement type of the input item from the general import mode
        specified in the input / in Step 1 of the import GUI.
        :param item: a dictionary containing the JSON data for a single measurement item sent
            from the front end
        :param default: the default value to return if no better one can be inferred
        :return: the measurement type, or the specified default if no better one is found
        """
        mtype_fn_lookup = {
            MODE_PROTEOMICS: self._mtype_proteomics,
            MODE_SKYLINE: self._mtype_skyline,
            MODE_TRANSCRIPTOMICS: self._mtype_transcriptomics,
            models.MeasurementType.Group.GENEID: self._mtype_transcriptomics,
            models.MeasurementType.Group.PROTEINID: self._mtype_proteomics,
        }
        mtype_fn = mtype_fn_lookup.get(self._load_hint(item), self._mtype_default)
        return mtype_fn(item, NO_TYPE)

    def _mtype_default(self, item, default=None):
        compartment = self._load_compartment(item)
        type_id = self._load_type_id(item)
        units_id = self._load_unit(item)
        # if type_id is not set, assume it's a lookup pattern
        if not type_id:
            name = item.get('measurement_name', None)
            # drop any non-ascii characters
            name = name.encode('ascii', 'ignore').decode('utf-8')
            if models.Metabolite.pubchem_pattern.match(name):
                metabolite = models.Metabolite.load_or_create(name)
                return MType(compartment, metabolite.pk, units_id)
            else:
                protein = models.ProteinIdentifier.load_or_create(name, self._user)
                return MType(compartment, protein.pk, units_id)
        return MType(compartment, type_id, units_id)

    def _mtype_proteomics(self, item, default=None):
        found_type = default
        compartment = self._load_compartment(item)
        measurement_name = item.get('measurement_name', None)
        units_id = self._load_unit(item)
        protein = models.ProteinIdentifier.load_or_create(measurement_name, self._user)
        found_type = MType(compartment, protein.pk, units_id)
        return found_type

    def _mtype_skyline(self, item, default=None):
        found_type = default
        compartment = self._load_compartment(item)
        measurement_name = item.get('measurement_name', None)
        units_id = self._load_unit(item)
        # check if measurement_name should load metabolite
        match = models.Metabolite.pubchem_pattern.match(measurement_name)
        if match:
            # TODO: refactor this to eliminate double-check on format, try all available lookups
            metabolite = models.Metabolite.load_or_create(measurement_name)
            found_type = MType(compartment, metabolite.pk, units_id)
        else:
            protein = models.ProteinIdentifier.load_or_create(measurement_name, self._user)
            found_type = MType(compartment, protein.pk, units_id)
        return found_type

    def _mtype_transcriptomics(self, item, default=None):
        compartment = self._load_compartment(item)
        measurement_name = item.get('measurement_name', None)
        units_id = self._load_unit(item)
        gene = models.GeneIdentifier.load_or_create(measurement_name, self._user)
        return MType(compartment, gene.pk, units_id)

    def _mtype_guess_format(self, points):
        mode = self._mode()
        if mode == 'mdv':
            return models.Measurement.Format.VECTOR    # carbon ratios are vectors
        elif mode in (MODE_TRANSCRIPTOMICS, MODE_PROTEOMICS):
            return models.Measurement.Format.SCALAR    # always single values
        elif len(points):
            # if first value looks like carbon ratio (vector), treat all as vector
            (x, y) = points[0]
            # several potential inputs to handle: list, string, numeric
            if isinstance(y, list):
                return models.Measurement.Format.VECTOR
            elif y is not None and isinstance(y, string_types) and ('/' in y or ':' in y):
                return models.Measurement.Format.VECTOR
        return models.Measurement.Format.SCALAR

    def _replace(self):
        return self._data.get('writemode', None) == 'r'
