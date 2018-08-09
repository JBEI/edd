# coding: utf-8
import importlib
import json
import logging
import math
from collections import OrderedDict
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import FileField

from ..codes import FileParseCodes, FileProcessingCodes
from ..models import Import, ImportCategory, ImportFile, ImportFormat
from ..utilities import ParseError, ImportTooLargeError
from ..utilities import ErrorAggregator
from main.models import (Assay, Line, GeneIdentifier, Measurement, MeasurementType,
                         MeasurementUnit, Metabolite, MetadataType, Phosphor, ProteinIdentifier,
                         Protocol)
from main.importer.parser import guess_extension, ImportFileTypeFlags
from main.importer.table import ImportBroker

logger = logging.getLogger(__name__)


MTYPE_GROUP_TO_CLASS = {
    MeasurementType.Group.GENERIC: MeasurementType,
    MeasurementType.Group.METABOLITE: Metabolite,
    MeasurementType.Group.GENEID: GeneIdentifier,
    MeasurementType.Group.PROTEINID: ProteinIdentifier,
    MeasurementType.Group.PHOSPHOR: Phosphor,
}


class ImportContext:
    """
    A cache of EDD database and related application context created during the file import process.
    Captures things like EDD MeasurementTypes and special-case Assay metadata used during the
    import process and unlikely to change on the time scale of processing a single import-related
    request.
    """
    def __init__(self, aggregator, user_pk, study_pk, category_pk, file_format_pk, protocol_pk,
                 compartment=None, x_units=None, y_units=None):
        """
        :raises ObjectDoesNotExist if the specified format isn't found
        """
        # look up the database entries for each piece of (mostly user-specified) context from
        # step 1... Not strictly necessary when running synchronously, but we're building this code
        # for simple transition to Celery
        User = get_user_model()
        self.user = User.objects.get(pk=user_pk)
        self.study_pk = study_pk
        self.protocol = Protocol.objects.get(pk=protocol_pk)
        self.category = ImportCategory.objects.get(pk=category_pk)
        self.hour_units = MeasurementUnit.objects.get(unit_name='hours')
        self.compartment = compartment

        self.x_units = x_units if x_units else self.hour_units
        self.y_units = y_units

        self.assay_time_metatype = MetadataType.objects.filter(
            for_context=MetadataType.ASSAY).get(type_name='Time')

        ###########################################################################################
        # Look up the file parser class based on user input
        ###########################################################################################
        self.file_format = ImportFormat.objects.get(pk=file_format_pk)
        self._get_parser_instance(aggregator)

        ###########################################################################################
        # study/EDD state cached after parsing file content
        ###########################################################################################
        # maps external identifiers from the import file, e.g. Uniprot accession ID, to the
        # identifier of the EDD
        self.mtype_name_to_type = {}

        self.loa_name_to_pk = {}  # maps line or assay name from the file to the model object pk

        self.unit_name_to_unit = {}

        self.line_ids = True  # False = file contains assay ID's instead

    def _get_parser_instance(self, aggregator):
        parser_class_name = self.file_format.parser_class

        # split fully-qualified class name into module and class names
        i = parser_class_name.rfind('.')
        if i < 0:
            aggregator.add_error(FileParseCodes.PARSER_NOT_FOUND, occurrence=parser_class_name)
            raise ParseError(self)

        try:
            module_name = parser_class_name[0:i]
            class_name = parser_class_name[i + 1:]

            # instantiate the parser.
            module = importlib.import_module(module_name)
            parser_class = getattr(module, class_name)
            self.parser = parser_class(aggregator=aggregator)
        except RuntimeError as r:
            aggregator.add_error(FileParseCodes.PARSER_NOT_FOUND, occurrence=r.message)
            raise ParseError(self)


# skeleton for Import 2.0, to be fleshed out later.  For now, we're just aggregating errors &
# warnings as part of the early testing process.
class ImportFileHandler(ErrorAggregator):

    def __init__(self, import_id, user_pk, study_pk, category_pk, file_format_pk, protocol_pk,
                 uploaded_file, compartment=None, x_units=None, y_units=None):
        """

        :raises: ObjectDoesNotExist if any of the provided primary keys don't match the database
        """
        super(ImportFileHandler, self).__init__()
        self.import_uuid = import_id
        self.cache = ImportContext(self, user_pk, study_pk, category_pk, file_format_pk,
                                   protocol_pk, compartment=compartment)
        self.file = uploaded_file
        self.latest_status = None

    def process_file(self, reprocessing_file):
        """
        Performs initial processing for an import file uploaded to EDD.  The main purpose of this
        method is to parse and resolve the content of the file against data in EDD's database and
        other partner databases, e.g. Uniprot, PubChem, etc. When this method runs to completion,
        the file content has been parsed, staged in the database along with user entries that
        control import context

        Basic steps of the process are:
        1.  Parse the file
        2.  Resolve line or assay names in the file against the study
        3.  Resolve MeasurementUnit MeasurementType and identifiers
        4. Identify any missing input required for import completion

        # resolve external identifiers
        # 1) If configurable / enforceable in EDD, enforce format for external ID's
        # 2) units, internal measurement types  # TODO: resolve with MeasurementType.type_group
        # 3) external databases (ICE, Uniprot, PubChem)
        :return:
        """
        # TODO: as an enhancement, compute & use file hashes to prevent re-upload
        ###########################################################################################
        # Parse the file, raising an Exception if any parse / initial verification errors occur
        ###########################################################################################
        cache = self.cache
        category = cache.category

        file = self.file
        mime_type = file.mime_type if isinstance(file, FileField) else file.content_type
        file_extension = guess_extension(mime_type)

        logger.info(f'Parsing import file {file.name} for study {cache.study_pk}, '
                    f'user {cache.user.username}')

        if file_extension not in (ImportFileTypeFlags.EXCEL, ImportFileTypeFlags.CSV):
            self.raise_error(FileParseCodes.UNSUPPORTED_FILE_TYPE, occurrence=file_extension)

        parser = cache.parser
        if file_extension == ImportFileTypeFlags.EXCEL:
            parser.parse_excel(file)
        else:
            parser.parse_csv(file)

        # if file format is unknown and parsing so far has only returned row/column data to the UI
        # for display, then just cache the inputs and return. arguably we don't have to even upload
        # the file until later, but the user has entered enough data to make restarting an
        # annoyance. Also this way we have a record for support purposes.
        if not cache.file_format:
            import_, _ = self._save_import_and_file(Import.Status.CREATED, reprocessing_file)
            return {
                'id': import_.uuid,
                'raw_data': parser.raw_data
            }

        ###########################################################################################
        # Resolve line / assay names from file to the study
        ###########################################################################################
        logger.info('Resolving identifiers against EDD and reference databases')
        # first try assay names, since some workflows will use them to resolve times (e.g.
        # Proteomics)
        line_or_assay_names = parser.unique_line_or_assay_names

        logger.info(f'Searching for {len(line_or_assay_names)} study internals')
        matched_assays = self._verify_line_or_assay_match(line_or_assay_names, lines=False)
        if not matched_assays:
            matched_lines = self._verify_line_or_assay_match(line_or_assay_names, lines=True)
            if not matched_lines:
                self.raise_error(FileProcessingCodes.UNNMATCHED_STUDY_INTERNALS,
                                 line_or_assay_names)

        ###########################################################################################
        # Resolve MeasurementType and MeasurementUnit identifiers from local and/or remote sources
        ###########################################################################################
        self._verify_measurement_types(parser)
        self._verify_units(parser)
        self.raise_errors()

        ###########################################################################################
        # Determine any additional data not present in the file that must be entered by the user
        ###########################################################################################
        # Detect preexisting assay time metadata, if present. E.g. in the proteomics workflow
        assay_pk_to_time = False
        if matched_assays:
            assay_pks = self.cache.loa_name_to_pk.values()
            assay_time_pk = self.cache.assay_time_metatype.pk
            assay_pk_to_time = verify_assay_times(self, assay_pks, parser, assay_time_pk)
        required_inputs = compute_required_context(category, cache.compartment, parser,
                                                   assay_pk_to_time)

        ###########################################################################################
        # Since import content is now verified & has some value, save the file and context to
        # the database
        ###########################################################################################
        logger.info('Saving parsed file and import context to the database')
        import_status = Import.Status.READY if not required_inputs else Import.Status.RESOLVED
        import_, initial_upload = self._save_import_and_file(import_status, reprocessing_file)

        # cache the import in redis, but don't actually trigger the Celery task yet...that's the
        # job of import step 5
        import_records = self.cache_resolved_import(import_.uuid, parser, matched_assays,
                                                    initial_upload)

        # build the json payload to send back to the UI for use in subsequent import steps
        unique_mtypes = cache.mtype_name_to_type.values()
        return import_, build_step4_ui_json(import_, required_inputs, import_records,
                                            unique_mtypes, cache.hour_units.pk)

    def _save_import_and_file(self, import_status, reprocessing_file):
        """

        :param import_status:
        :return: (import_model, initial_upload)
        """
        cache = self.cache
        with transaction.atomic():
            import_uuid = self.import_uuid

            if not reprocessing_file:
                # if a file was already uploaded, delete the old one
                ImportFile.objects.filter(import_ref__uuid=import_uuid).delete()

                # save the new file
                file_model = ImportFile.objects.create(file=self.file)
            else:
                file_model = self.file

            # if this is the first upload attempt, assign a new uuid
            self.import_uuid = self.import_uuid if self.import_uuid else uuid4()

            import_context = {
                'study_id': cache.study_pk,
                'category_id': cache.category.pk,
                'status': import_status,
                'file_id': file_model.pk,
                'file_format_id': cache.file_format.pk if cache.file_format else None,
                'protocol_id': cache.protocol.pk,
            }

            # if provided by the client, save global unit specifiers, etc whose use is
            # context-dependent
            if self.cache.x_units:
                import_context['x_units'] = self.cache.x_units

            if self.cache.y_units:
                import_context['y_units'] = self.cache.y_units

            if self.cache.compartment:
                import_context['compartment'] = self.cache.compartment

            return Import.objects.update_or_create(
                uuid=self.import_uuid,
                defaults=import_context)

    def _verify_line_or_assay_match(self, line_or_assay_names, lines):
        context = self.cache
        extract_vals = ['name', 'pk']
        if lines:
            qs = Line.objects.filter(study_id=context.study_pk,
                                     name__in=line_or_assay_names).values(*extract_vals)
        else:
            qs = Assay.objects.filter(line__study_id=context.study_pk,
                                      name__in=line_or_assay_names,
                                      protocol_id=context.protocol.pk).values(*extract_vals)
        found_count = len(qs)  # evaluate qs and get the # results
        if found_count:
            model = 'line' if lines else 'assay'
            logger.debug(f'Matched {found_count} of {len(line_or_assay_names)} {model} names '
                         f'from the file')
            context.loa_name_to_pk = {result['name']: result['pk'] for result in qs}

            if found_count != len(line_or_assay_names):
                missing_names = line_or_assay_names - context.loa_name_to_pk.keys()
                err_code = (FileProcessingCodes.UNMATCHED_LINE_NAME if lines else
                            FileProcessingCodes.UNMATCHED_ASSAY_NAME)
                self.add_errors(err_code, occurrences=missing_names)
                self.raise_errors()

        return bool(found_count)

    def _verify_measurement_types(self, parser):
        # TODO: in some cases, we can significantly improve user experience here by aggregating
        # lookup errors... though at the risk of more expensive failures.. maybe a good compromise
        # is to wait for a small handful of errors before failing?
        # TODO: also current model implementations don't allow us to distinguish between different
        # types of errors in linked applications (e.g. connection errors vs permissions errors
        # vs identifier verified not found...consider adding complexity / transparency)

        category_name = self.cache.category.name
        mtype_group = self.cache.category.default_mtype_group
        err_limit = 100  # TODO: make this a setting
        err_count = 0

        types = f': {parser.unique_mtypes}' if len(parser.unique_mtypes) <= 10 else ''
        logger.debug(f'Verifying MeasurementTypes for category "{category_name}"=> '
                     f'type "{mtype_group}"{types}')

        for mtype_id in parser.unique_mtypes:
            try:
                mtype = self._mtype_lookup(mtype_id, mtype_group)
                self.cache.mtype_name_to_type[mtype_id] = mtype
            except ValidationError as v:
                logger.exception(f'Exception verifying MeasurementType id {mtype_id}')
                self.add_error(FileProcessingCodes.MEASUREMENT_TYPE_NOT_FOUND, mtype_id)
                err_count += 1
                if err_count == err_limit:
                    break

    def _verify_units(self, parser):
        # Note, we purposefully DON'T use MeasurementUnit.type_group, since allowed units should be
        # associated with Protocol and should instead be ripped out.  Initial implementation here
        # used it and ran into trouble with "n/a" units (e.g. OD) which are
        # incorrectly classified as metabolite (but may still have some code dependencies). Other
        # yet-unidentified/problematic legacy data may exist.

        cache = self.cache
        units = MeasurementUnit.objects.filter(unit_name__in=parser.unique_units)
        cache.unit_name_to_unit = {unit.unit_name: unit for unit in units}
        missing_units = parser.unique_units - cache.unit_name_to_unit.keys()

        if missing_units:
            self.add_errors(FileParseCodes.UNSUPPORTED_UNITS, occurrences=missing_units)

    def _mtype_lookup(self, mtype_id, mtype_group):
        """
        A simple wrapper function to unify the interface for load_or_create() for the various
        MeasurementType subclasses.
        :param mtype_id: the type name to search for...maybe in EDD, maybe in an external database.
        EDD is always checked first.
        :param mtype_group: the MeasurementType.Group identifying which class of MeasurementTypes
        to limit the search to
        :raise ValidationError: if the type couldn't be found or created (for any reason).
        TODO: as a future enhancement, add in more detailed error handling to those methods (likely
        in a parallel implementation to avoid breaking the legacy import).  Also consider
        unifying the interface in the core models.
        """
        if mtype_group == MeasurementType.Group.GENERIC:
            try:
                return MeasurementType.objects.get(type_name=mtype_id)
            except ObjectDoesNotExist:
                raise ValidationError(f'Measurement Type "{mtype_id}" not found')
        if mtype_group == MeasurementType.Group.METABOLITE:
            return Metabolite.load_or_create(mtype_id)
        else:
            mtype_class = MTYPE_GROUP_TO_CLASS[mtype_group]
            return mtype_class.load_or_create(mtype_id, self.cache.user)

    def cache_resolved_import(self, import_id, parser, matched_assays, initial_upload):
        """
        Converts MeasurementParseRecords into JSON to send to the legacy import Celery task.
        See RawImportSet in Import.ts or main.importer.table.TableImport._load_measurement_record()
        """
        logger.debug(f'Cacheing resolved import data to Redis: {import_id}')

        cache = self.cache
        protocol = self.cache.protocol
        compartment = cache.compartment

        broker = ImportBroker()
        if not initial_upload:
            broker.clear_pages(import_id)

        import_records = OrderedDict()  # maintain the order of items from the file for debugging
        for index, parse_record in enumerate(parser.series_data):

            # extract info from the parse record and build a unique ID for the Measurement to be
            # created
            # TODO: Note protocol is *often* superfluous, but maybe not always...e.g. biolector
            # may break up measurements into multiple assays and assign each to the relevant
            # sub-protocol ...need to investigate this more before removing protocol from the ID
            assay_or_line_pk = self.cache.loa_name_to_pk.get(parse_record.line_or_assay_name)
            mtype = (cache.mtype_name_to_type[parse_record.mtype_name] if
                     parse_record.mtype_name else None)
            unit = (cache.unit_name_to_unit[parse_record.units_name] if
                    parse_record.units_name else None)
            ident = (assay_or_line_pk, protocol.pk, mtype.pk, unit.pk)

            # merge parse records that match the same ID (but should have different times)
            import_record = import_records.get(ident)
            if not import_record:
                import_record = {
                    # TODO: vestiges of the older import? consider also, e.g. Biolector
                    # 'kind': 'std',
                    # 'hint': None,

                    'measurement_id': mtype.pk,
                    'compartment_id': compartment,
                    'units_id': unit.pk,
                    'data': [parse_record.data],
                    'src_ids': []  # ids for where the data came from, e.g. row #s in an Excel file
                }

                if matched_assays:
                    import_record['assay_id'] = assay_or_line_pk
                else:
                    line_pk = assay_or_line_pk
                    import_record['assay_id'] = 'new'
                    import_record['line_id'] = line_pk
                    import_record['protocol_id'] = cache.protocol.pk
                    assays_count = Assay.objects.filter(line_id=line_pk,
                                                        protocol_id=protocol.pk).count()
                    if assays_count:
                        self.raise_error(FileProcessingCodes.MERGE_NOT_SUPPORTED)
                import_records[ident] = import_record

            else:
                # TODO: after this is working / unit tested, optimize by investigating
                # Python library options & using a  more efficient search algorithm
                import_series = import_record['data']
                insert_index = None
                for index, import_data_entry in enumerate(import_series):
                    import_time = import_data_entry[0]
                    parsed_time = parse_record.data[0]

                    # detect parse records that clash with each other, e.g. that fall
                    # exactly on the same line/assay + time + measurement type
                    if import_time == parsed_time:
                        self._record_record_clash(import_time, import_record, parse_record, mtype)
                    elif import_time > parsed_time:
                        insert_index = index
                        break
                if insert_index is not None:
                    import_series.insert(insert_index, parse_record.data)
                else:
                    import_series.append(parse_record.data)

        import_records_list = list(import_records.values())

        # break import records into pages that conform to the cache page limit settings...we'll
        # respect the settings while they exist, since they have performance impact on the back
        # end code, though they'll be used differently post-transition, and maybe removed
        # later
        import_cache_pages = self._paginate_cache(import_records_list)

        # simulate the context parameters that made more sense in the legacy import..."mode"/ aka
        # "datalayout" selection has since been broken down into separate "data category" and
        # "file format" items, and other items names are determined from form element names in
        # the TypeScript code. We should eventually refactor the JSON and Celery task to conform to
        # the new paradigm

        # note: we always use 'datalayout':'std' to bypass special-case processing in the legacy
        # Celery back end that exists to create new MeasurementTypes as part of the final import
        # process.  In import 2.0, new MeasurementTypes should already be created before that code
        # runs.
        cache_page_size = settings.EDD_IMPORT_PAGE_SIZE
        page_count = math.ceil(len(import_records) / cache_page_size)
        context = {
            'totalPages': page_count,
            'importId': str(import_id),
            'datalayout': 'std',
            'masterMCompValue': None,
            'masterMTypeValue': None,
            'masterMUnitsValue': None,
            'writemode': None,
        }

        broker.set_context(import_id, json.dumps(context))

        for page in import_cache_pages:
            broker.add_page(import_id, json.dumps(page))

        return import_records_list

    def _paginate_cache(self, import_records):
        cache_page_size = settings.EDD_IMPORT_PAGE_SIZE
        max_cache_pages = settings.EDD_IMPORT_PAGE_LIMIT

        page_count = math.ceil(len(import_records) / cache_page_size)
        if page_count > max_cache_pages:
            raise ImportTooLargeError(
                'Total number of pages is greater than allowed '
                f'maximum {settings.EDD_IMPORT_PAGE_LIMIT}'
            )

        for i in range(0, len(import_records), cache_page_size):
            yield import_records[i:i+cache_page_size]

    def _record_record_clash(self, import_time, import_record, parse_record, mtype):
        occurrences = []
        if len(import_record.src_ids) == 1:
            occurrences.extend(import_record.src_ids)
        occurrences.append(parse_record.src_id)
        self.add_errors(FileProcessingCodes.MEASUREMENT_COLLISION,
                        f'({mtype.type_name}, T={import_time})', occurrences=occurrences)
        return True


def verify_assay_times(err_aggregator, assay_pks, parser, assay_time_meta_pk):
    """
    Checks existing assays ID'd in the import file for time metadata, and verifies that they
    all have time metadata (or don't).
    :return: a dict that maps assay pk => time if assay times were consistently found,
    None if they were consistently *not* found
    :raises ImportError if time is inconsistently specified or overspecified
    """

    times_qs = Assay.objects.filter(pk__in=assay_pks, meta_store__has_key=assay_time_meta_pk)
    times_qs = times_qs.values('pk', 'meta_store__time')

    times_count = len(times_qs)

    if times_count == len(assay_pks):
        if parser.has_all_times:
            err_aggregator.add_error(
                FileProcessingCodes.DUPLICATE_DATA_ENTRY,
                occurrence='Time is provided both in the file and in assay metadata'
            )
            err_aggregator.raise_errors()

        return {result['pk']: result['time'] for result in times_qs}

    elif times_count != 0:
        missing_pks = Assay.objects.filter(pk__in=assay_pks)
        missing_pks = missing_pks.exclude(meta_store__has_key=assay_time_meta_pk)
        missing_pks = missing_pks.values_list('pk', flat=True)
        err_aggregator.add_errors(FileProcessingCodes.ASSAYS_MISSING_TIME,
                                  occurrences=missing_pks)
        err_aggregator.raise_errors()

    return None


class SeriesCacheParser:
    """
    A parser that reads import records from the legacy Redis cache and extracts relevant
    data to return to the import UI without re-parsing and re-verifying the file content (e.g.
    external database identifiers)
    """
    def __init__(self, master_time=None, master_units=None, master_compartment=None):
        self.all_records_have_time = False
        self.all_records_have_units = False
        self.all_records_have_compartment = False
        self.master_time = master_time
        self.master_units = master_units
        self.master_compartment = master_compartment
        self.matched_assays = False
        self.mtype_pks = set()
        self.loa_pks = set()  # line or assay pks

    def parse(self, import_uuid):

        broker = ImportBroker()
        cache_pages = broker.load_pages(import_uuid)

        import_records = []

        self.all_records_have_time = True
        self.all_records_have_units = True
        self.all_records_have_compartment = True
        self.matched_assays = True
        for page in cache_pages:
            page_json = json.loads(page)
            for import_record in page_json:
                measurement_pk = import_record.get('measurement_id')
                self.mtype_pks.add(measurement_pk)

                if import_record.data[0] is None:
                    self.all_records_have_time = False

                if hasattr(import_record, 'line_id'):
                    self._add_id(import_record['line_id'])
                    self.matched_assays = False
                else:
                    self._add_id(import_record['assay_id'])

            import_records.extend(page_json)

        return import_records

    def _add_id(self, val):
        if val not in ('new', 'named_or_new'):  # ignore placeholders, just get real pks
            self.loa_pks.add(val)

    def has_all_times(self):
        return self.master_time or self.all_records_have_time

    def has_all_units(self):
        return self.master_units or self.all_records_have_units

    def has_all_compartments(self):
        return self.master_compartment or self.all_records_have_compartment

    @property
    def mtypes(self):
        return self.mtype_pks


def build_ui_payload_from_cache(import_):
    """
    Loads existing import records from Redis cache and parses them in lieu of re-parsing the
    file and re-resolving string-based line/assay/MeasurementType identifiers from the
    uploaded file.  This method supports the transition from Step 3 -> Step 4 of the import,
    and this implementation lets us leverage most of the same code to support the Step 3 -> 4
    transition as we use for the Step 2 -> 4 transition.

    :return: the UI JSON for Step 4 "Inspect"
    """
    parser = SeriesCacheParser(master_units=import_.y_units)
    import_records = parser.parse(import_.uuid)
    aggregator = ErrorAggregator()

    # look up MeasurementTypes referenced in the import so we can build JSON containing them.
    # if we got this far, they'll be in EDD's database unless recently removed, which should
    # be unlikely
    category = import_.category
    MTypeClass = MTYPE_GROUP_TO_CLASS[category.mtype_group]
    unique_mtypes = MTypeClass.objects.filter(pk__in=parser.mtype_pks)

    # get other context from the database
    hour_units = MeasurementUnit.objects.get(unit_name='hours')
    assay_time_meta_pk = MetadataType.objects.filter(type_name='Time',
                                                     for_context=MetadataType.ASSAY)
    found_count = len(unique_mtypes)

    if found_count != len(parser.mtype_pks):
        missing_pks = {mtype.pk for mtype in unique_mtypes} - parser.mtype_pks
        aggregator.raise_errors(FileProcessingCodes.MEASUREMENT_TYPE_NOT_FOUND,
                                occurrences=missing_pks)

    # TODO: fold assay times into UI payload to give user helpful feedback as in UI mockup
    assay_pk_to_time = None
    if parser.matched_assays:
        assay_pks = parser.loa_pks
        assay_pk_to_time = verify_assay_times(aggregator, assay_pks, parser,
                                              assay_time_meta_pk)
    required_inputs = compute_required_context(category, import_.compartment, parser,
                                               assay_pk_to_time)

    return build_step4_ui_json(import_, required_inputs, import_records, unique_mtypes,
                               hour_units.pk)


def build_step4_ui_json(import_, required_inputs, import_records,  unique_mtypes, time_units_pk):
    """
    Build JSON to send to the new import front end, including some legacy data for easy
    display in the existing TS graphing code (which may get replaced later). Relative to the
    import JSON, x and y elements are further broken down into separate lists. Note that JSON
    generated here should match that produced by the /s/{study_slug}/measurements/ view
    TODO: address PR comment re: code organization
    https://repo.jbei.org/projects/EDD/repos/edd-django/pull-requests/425/overview?commentId=3073
    """
    logger.debug('Building UI JSON for user inspection')

    assay_id_to_meas_count = {}

    measures = []
    data = {}
    for index, import_record in enumerate(import_records):
        import_data = import_record['data']

        # if this import is creating new assays, assign temporary IDs to them for pre-import
        # display and possible deactivation in step 4.  If the import is updating existing
        # assays, use their real pk's.
        assay_id = import_record['assay_id']
        assay_id = assay_id if assay_id not in ('new', 'named_or_new') else index

        mcount = assay_id_to_meas_count.get(assay_id, 0)
        mcount += 1
        assay_id_to_meas_count[assay_id] = mcount

        # TODO: file format, content, and protocol should all likely be considerations here.
        # Once supported by the Celery task, consider moving this determination up to the
        # parsing step  where the information is all available on a per-measurement basis.
        format = Measurement.Format.SCALAR
        if len(import_data) > 2:
            format = Measurement.Format.VECTOR

        measures.append({
            # assign temporary measurement ID's.
            # TODO: revisit when implementing collision detection/merge similar to assays
            # above. Likely need detection/tracking earlier in the process to do this with
            # measurements.
            'id': index,

            'assay': assay_id,
            'type': import_record['measurement_id'],
            'comp': import_record['compartment_id'],
            'format': format,
            'x_units': time_units_pk,
            'y_units': import_record['units_id'],
            'meta': {},
        })

        # repackage data from the import into the format used by the legacy study data UI
        # Note: assuming based on initial example that it's broken up into separate arrays
        # along x and y measurements...correct if that's not born out by other examples (maybe
        # it's just an array per element)
        measurement_vals = []
        data[str(index)] = measurement_vals
        for imported_timepoint in import_data:
            display_timepoint = [[imported_timepoint[0]]]  # x-value
            display_timepoint.append(imported_timepoint[1:])  # y-value(s)
            measurement_vals.append(display_timepoint)

    return {
        'pk': f'{import_.pk}',
        'uuid': f'{import_.uuid}',
        'status': import_.status,
        'total_measures': assay_id_to_meas_count,
        'required_values': required_inputs,
        'types': {str(mtype.id): mtype.to_json() for mtype in unique_mtypes},
        'measures': measures,
        'data': data,
    }


def compute_required_context(category, compartment, parser, assay_meta_times):
    required_inputs = []

    # TODO: verify assumptions here re: auto-selected compartment.
    # status quo is that its only needed for metabolomics, but should be configured in protocol
    if category.name == 'Metabolomics' and not compartment:
        required_inputs.append('compartment')

    if not (assay_meta_times or parser.has_all_times):
        required_inputs.append('time')

    if not parser.has_all_units:
        required_inputs.append('units')

    return required_inputs
