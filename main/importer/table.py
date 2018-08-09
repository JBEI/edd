# coding: utf-8

import logging
import re
import warnings

from collections import namedtuple
from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.utils.translation import ugettext as _
from six import string_types

from .. import models, redis


logger = logging.getLogger(__name__)
MType = namedtuple('MType', ['compartment', 'type', 'unit', ])
NO_TYPE = MType(models.Measurement.Compartment.UNKNOWN, None, None)


MODE_PROTEOMICS = 'pr'
MODE_SKYLINE = 'skyline'
MODE_TRANSCRIPTOMICS = 'tr'


class ImportException(Exception):
    pass


class ImportTooLargeException(ImportException):
    pass


class ImportBoundsException(ImportException):
    pass


class ImportBroker(object):
    def __init__(self):
        self.storage = redis.ScratchStorage(key_prefix=f'{__name__}.{self.__class__.__name__}')

    def _import_name(self, import_id):
        return f'{import_id}'

    def set_context(self, import_id, context):
        name = self._import_name(import_id)
        self.storage.save(context, name=name, expires=settings.EDD_IMPORT_CACHE_LENGTH)

    def add_page(self, import_id, page):
        name = f'{self._import_name(import_id)}:pages'
        _, count = self.storage.append(page, name=name, expires=settings.EDD_IMPORT_CACHE_LENGTH)
        return count

    def check_bounds(self, import_id, page, expected_count):
        if len(page) > settings.EDD_IMPORT_PAGE_SIZE:
            raise ImportTooLargeException(
                f'Page size is greater than maximum {settings.EDD_IMPORT_PAGE_SIZE}'
            )
        if expected_count > settings.EDD_IMPORT_PAGE_LIMIT:
            raise ImportTooLargeException(
                'Total number of pages is greater than allowed '
                f'maximum {settings.EDD_IMPORT_PAGE_LIMIT}'
            )
        name = f'{self._import_name(import_id)}:pages'
        if self.storage.page_count(name) >= expected_count:
            raise ImportBoundsException('Data is already cached for import')

    def clear_pages(self, import_id):
        name = f'{self._import_name(import_id)}*'
        self.storage.delete(name)

    def load_context(self, import_id):
        name = self._import_name(import_id)
        return self.storage.load(name)

    def load_pages(self, import_id):
        name = f'{self._import_name(import_id)}:pages'
        return self.storage.load_pages(name)


class TableImport(object):
    """
    Object to handle processing of data POSTed to /study/{id}/import view and add
    measurements to the database.
    """

    def __init__(self, study, user):
        """
        Creates an import handler.

        :param study: the target study for import
        :param user: the user performing the import
        :raises: PermissionDenied if the user does not have write access to the study
        """

        # context for how import data are processed
        self.mode = None
        self.master_compartment = models.Measurement.Compartment.UNKNOWN
        self.master_mtype_id = None
        self.master_unit_id = None
        self.replace = False

        self._study = study
        self._user = user
        # lookups for line/assay by names
        self._line_assay_lookup = {}
        self._line_lookup = {}
        self._meta_lookup = {}
        self._valid_protocol = {}
        # lookups for line/assay by IDs
        self._line_by_id = {}
        self._assay_by_id = {}
        # end up looking for hours repeatedly, just load once at init
        self._hours = models.MeasurementUnit.objects.get(unit_name='hours')
        if not self._study.user_can_write(user):
            raise PermissionDenied(
                f'{user.username} does not have write access to study "{study.name}"'
            )

    def parse_context(self, context):
        self.mode = context.get('datalayout', None)
        self.master_compartment = context.get('masterMCompValue', None)
        if not self.master_compartment:
            self.master_compartment = models.Measurement.Compartment.UNKNOWN
        self.master_mtype_id = context.get('masterMTypeValue', None)
        self.master_unit_id = context.get('masterMUnitsValue', None)
        self.replace = context.get('writemode', None) == 'r'

    def import_series_data(self, series_data):
        """
        Imports data into the study.  Assumption is that parse_context() has already been run or
        that a client has directly set related importer attributes.

        :param series_data: series data to import into the study.
        :return: a tuple with a summary of measurement counts in the form (added, updated)
        """
        self.check_series_points(series_data)
        self.init_lines_and_assays(series_data)
        return self.create_measurements(series_data)

    def finish_import(self):
        # after importing, force updates of previously-existing lines and assays
        for assay in self._assay_by_id.values():
            # force refresh of Assay's Update (also saves any changed metadata)
            assay.save(update_fields=['meta_store', 'updated'])
        for line in self._line_by_id.values():
            # force refresh of Update (also saves any changed metadata)
            line.save(update_fields=['meta_store', 'updated'])
        # and force update of the study
        self._study.save(update_fields=['meta_store', 'updated'])

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
        elif assay_id in self._assay_by_id:
            assay = self._assay_by_id.get(assay_id)
        elif assay_id not in ['new', 'named_or_new', ]:
            # attempt to lookup existing assay
            try:
                assay = models.Assay.objects.get(pk=assay_id, line__study_id=self._study.pk)
                self._assay_by_id[assay_id] = assay
            except models.Assay.DoesNotExist:
                logger.warning(
                    f'Import set cannot load Assay,Study: {assay_id},{self._study.pk}'
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
                key = (line.id, assay_name)
                if key in self._line_assay_lookup:
                    assay = self._line_assay_lookup[key]
                else:
                    assay = line.assay_set.create(
                        name=assay_name,
                        protocol=protocol,
                        experimenter=self._user,
                    )
                    logger.info(f'Created new Assay {assay.id}:{assay_name}')
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
        elif line_id in self._line_by_id:
            line = self._line_by_id.get(line_id)
        else:
            try:
                line = models.Line.objects.get(pk=line_id, study_id=self._study.pk)
                self._line_by_id[line_id] = line
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

        # TODO: try doing loop twice, first with models.Measurement.objects.bulk_create()
        # then with models.MeasurementValue.objects.bulk_create()
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
        return (added, updated)

    def _load_measurement_record(self, item):
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
            if self.replace:
                records.delete()
            else:
                record = records[0]  # only SELECT query once
                record.save(update_fields=['update_ref'])  # force refresh of Update
                return record
        find.update(experimenter=self._user)
        logger.debug("Creating measurement with: %s", find)
        return assay.measurement_set.create(**find)

    def _process_measurement_points(self, record, points):
        total_added = 0
        total_updated = 0
        for x, y in points:
            (xvalue, yvalue) = (self._extract_value(x), self._extract_value(y))
            updated = record.measurementvalue_set.filter(x=xvalue).update(y=yvalue)
            total_updated += updated
            if updated == 0:
                record.measurementvalue_set.create(x=xvalue, y=yvalue)
                total_added += 1
        return (total_added, total_updated)

    def _process_metadata(self, assay, meta):
        if len(meta) > 0:
            if self.replace:
                # would be simpler to do assay.meta_store.clear()
                # but we only want to replace types included in import data
                for metatype in self._meta_lookup.values():
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
            compartment = self.master_compartment
        return compartment

    def _load_hint(self, item):
        hint = item.get('hint', None)
        if hint:
            return hint
        return self.mode

    def _load_type_id(self, item):
        type_id = item.get('measurement_id', None)
        if type_id is None:
            return self.master_mtype_id
        return type_id

    def _load_unit(self, item):
        unit = item.get('units_id', None)
        if not unit:
            unit = self.master_unit_id
            # TODO: get rid of magic number fallback; every EDD will have n/a as Unit #1?
            if not unit:
                unit = 1
        return unit

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
        if self.mode == 'mdv':
            return models.Measurement.Format.VECTOR    # carbon ratios are vectors
        elif self.mode in (MODE_TRANSCRIPTOMICS, MODE_PROTEOMICS):
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
