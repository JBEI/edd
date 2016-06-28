# coding: utf-8
from __future__ import unicode_literals

import json
import logging
import re
import warnings

from collections import namedtuple
from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.utils.translation import ugettext as _

from ..models import (
    Assay, Datasource, GeneIdentifier, Line, MeasurementCompartment, MeasurementFormat,
    MeasurementType, MeasurementUnit, MeasurementValue, MetadataType, ProteinIdentifier, Protocol
)


logger = logging.getLogger(__name__)
MType = namedtuple('MType', ['compartment', 'type', 'unit', ])


class TableImport(object):
    """ Object to handle processing of data POSTed to /study/{id}/import view and add
        measurements to the database. """

    def __init__(self, study, user, request=None):
        self._study = study
        self._user = user
        if not study.user_can_write(user):
            raise PermissionDenied("%s does not have write access to %s" % (
                user.username, study.name))
        self._line_assay_lookup = {}
        self._line_lookup = {}
        self._meta_lookup = {}
        self._unit_lookup = {}
        self._request = request

    def import_data(self, data):
        self._data = data
        series = json.loads(data.get('jsonoutput', '[]'))
        self.check_series_points(series)
        self.init_lines_and_assays(series)
        return self.create_measurements(series)

    def check_series_points(self, series):
        """ Checks that each item in the series has some data or metadata. """
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
                assay = Assay.objects.get(pk=assay_id, line__study_id=self._study.pk)
            except Assay.DoesNotExist:
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
            if assay_name is None or assay_name.strip() == '':
                # if we have no name, 'named_or_new' and 'new' are treated the same
                assay_name = str(line.new_assay_number(protocol))
            key = (line.id, assay_name)
            if protocol is None or line is None:
                pass  # already logged errors, move on
            elif key in self._line_assay_lookup:
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
                line = Line.objects.get(pk=line_id, study_id=self._study.pk)
            except Line.DoesNotExist:
                logger.warning(
                    'Import set cannot load Line,Study: %(line_id)s,%(study_id)s' % {
                        'line_id': line_id,
                        'study_id': self._study.pk,
                    }
                )
                item['invalid_fields'] = True
        return line

    def _init_item_protocol(self, item):
        protocol = None
        protocol_id = item.get('protocol_id', None)
        if protocol_id is None:
            logger.warning('Import set needs new Assay, but has undefined protocol_id field.')
            item['invalid_fields'] = True
        else:
            try:
                protocol = Protocol.objects.get(pk=protocol_id)
            except Protocol.DoesNotExist:
                logger.warning('Import set cannot load protocol %s' % (protocol_id))
                item['invalid_fields'] = True
        return protocol

    def create_measurements(self, series):
        added = 0
        hours = MeasurementUnit.objects.get(unit_name='hours')
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
                record = self._load_measurement_record(item, hours)
                added += self._process_measurement_points(record, points)
                self._process_metadata(assay, meta)
                # force refresh of Assay's Update (also saves any changed metadata)
                assay.save()
        for line in self._line_lookup.values():
            # force refresh of Update (also saves any changed metadata)
            line.save()
        self._study.save()
        return added

    def _load_measurement_record(self, item, hours):
        # TODO: stuffing hours in parameter list is a little gross, but otherwise would need
        #   multiple unnecessary queries
        assay = item['assay_obj']
        points = item.get('data', [])
        mtype = self._mtype(item)
        logger.info('Loading measurements for %s:%s' % (mtype.compartment, mtype.type))
        records = assay.measurement_set.filter(
            measurement_type=mtype.type,
            compartment=mtype.compartment,
        )
        record = None
        if records.count() > 0:
            if self._replace():
                records.delete()
            else:
                record = records[0]
                record.save()  # force refresh of Update
        if record is None:
            record = assay.measurement_set.create(
                measurement_type=mtype.type,
                measurement_format=self._mtype_guess_format(points),
                compartment=mtype.compartment,
                experimenter=self._user,
                x_units=hours,
                y_units=mtype.unit,
            )
        return record

    def _process_measurement_points(self, record, points):
        added = 0
        for x, y in points:
            (xvalue, yvalue) = (self._extract_value(x), self._extract_value(y))
            try:
                point = record.measurementvalue_set.get(x=xvalue)
            except MeasurementValue.DoesNotExist:
                point = record.measurementvalue_set.create(x=xvalue, y=yvalue)
            else:
                point.y = yvalue
                point.save()
            added += 1
        return added

    def _process_metadata(self, assay, meta):
        if len(meta) > 0:
            if self._replace():
                # would be simpler to do assay.meta_store.clear()
                # but we only want to replace types included in import data
                for label, metatype in self._meta_lookup.items():
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
            return map(float, re.split('/|:', ('%s' % value).replace(',', '')))
        except ValueError:
            warnings.warn('Value %s could not be interpreted as a number' % value)
        return []

    def _layout(self):
        return self._data.get('datalayout', None)

    def _metatype(self, meta_id):
        if meta_id not in self._meta_lookup:
            try:
                self._meta_lookup[meta_id] = MetadataType.objects.get(pk=meta_id)
            except MetadataType.DoesNotExist:
                logger.warning('No MetadataType found for %s' % meta_id)
        return self._meta_lookup.get(meta_id, None)

    def _mtype(self, item):
        hours = MeasurementUnit.objects.get(unit_name='hours')
        NO_TYPE = MType(MeasurementCompartment.UNKNOWN, None, hours)
        # In Transcriptomics and Proteomics mode, we attempt to resolve measurements client-side,
        # so we go by the measurement_name, ignoring the measurement_id and related fields (which
        # will be blank)
        found_type = self._mtype_from_layout(item, hours, default=NO_TYPE)
        if found_type is NO_TYPE:
            try:
                type_id = item.get('measurement_id', 0)
                units_id = item.get('units_id', 0)
                found_type = MType(
                    item.get('compartment_id', MeasurementCompartment.UNKNOWN),
                    MeasurementType.objects.get(pk=type_id),
                    MeasurementUnit.objects.get(pk=units_id)
                )
            except MeasurementType.DoesNotExist as e:
                # failed to match type
                self._messages_error(
                    _('Could not match selected Measurement Type; got type ID = %(type_id)s.') % {
                        'type_id': type_id,
                    }
                )
                pass
            except MeasurementUnit.DoesNotExist as e:
                # failed to match unit
                self._messages_error(
                    _('Could not match selected Measurement Unit; got unit ID = %(unit_id)s.') % {
                        'unit_id': units_id,
                    }
                )
                pass
            except ValueError as e:
                # failed to parse type or unit
                self._messages_error(
                    _('Failed to parse data for Type or Units of measurement. Did you specify a '
                      'type and unit for the measurements? Error details: %(err_msg)s') % {
                        'err_msg': e,
                    }
                )
                pass
        return found_type

    def _mtype_from_layout(self, item, hours, default=None):
        found_type = default
        layout = self._layout()
        label = item.get('measurement_name', None)
        source = Datasource(name=self._user.username)  # defining, but not saving unless needed
        label = item.get('measurement_name', None)
        if layout == 'tr':
            genes = GeneIdentifier.objects.filter(type_name=label)
            if len(genes) == 1:
                found_type = MType(MeasurementCompartment.UNKNOWN, genes[0], hours)
            else:
                logger.warning('Found %(length)s GeneIdentifier instances for %(label)s' % {
                    'length': len(genes),
                    'label': label,
                })
        elif layout == 'pr':
            proteins = ProteinIdentifier.objects.filter(
                Q(short_name=ProteinIdentifier.match_accession_id(label)) |
                Q(short_name=label) |
                Q(type_name=label)
            )
            if len(proteins) == 1:
                found_type = MType(MeasurementCompartment.UNKNOWN, proteins[0], hours)
            else:
                logger.warning('Found %(length)s ProteinIdentifier instances for %(label)s' % {
                    'length': len(proteins),
                    'label': label,
                })
                if len(proteins) > 1:
                    # FIXME: choosing the first one for now, should be error?
                    found_type = MType(MeasurementCompartment.UNKNOWN, proteins[0], hours)
                else:
                    # FIXME: this blindly creates a new type; should try external lookups first?
                    try:
                        p = ProteinIdentifier.objects.create(type_name=label, source=source)
                    except:
                        logger.error('Failed to create ProteinIdentifier %s' % label)
                    else:
                        found_type = MType(MeasurementCompartment.UNKNOWN, p.pk, hours)
        return found_type

    def _mtype_guess_format(self, points):
        layout = self._layout()
        if layout == 'mdv':
            return MeasurementFormat.VECTOR    # carbon ratios are vectors
        elif layout in ('tr', 'pr'):
            return MeasurementFormat.SCALAR    # always single values
        else:
            # if any value looks like carbon ratio (vector), treat all as vector
            for (x, y) in points:
                if y is not None and ('/' in y or ':' in y):
                    return MeasurementFormat.VECTOR
            return MeasurementFormat.SCALAR

    def _replace(self):
        return self._data.get('writemode', None) == 'r'

    def _unit(self, unit_id):
        if unit_id not in self._unit_lookup:
            try:
                self._unit_lookup[unit_id] = MeasurementUnit.objects.get(id=unit_id)
            except MeasurementUnit.DoesNotExist:
                logger.warning('No MeasurementUnit found for %s' % unit_id)
        return self._unit_lookup.get(unit_id, None)

    def _messages_error(self, message, **kwargs):
        """ Simple wrapper for django messages framework if request passed to TableImport. """
        if self._request is not None:
            messages.error(self._request, message, **kwargs)

    def _messages_success(self, message, **kwargs):
        """ Simple wrapper for django messages framework if request passed to TableImport. """
        if self._request is not None:
            messages.success(self._request, message, **kwargs)

    def _messages_warning(self, message, **kwargs):
        """ Simple wrapper for django messages framework if request passed to TableImport. """
        if self._request is not None:
            messages.warning(self._request, message, **kwargs)
