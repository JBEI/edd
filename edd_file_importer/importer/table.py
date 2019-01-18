# coding: utf-8
import importlib
import json
import logging
import math
from collections import OrderedDict

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db.models import Count
from django.utils.translation import ugettext_lazy as _

from ..codes import FileParseCodes, FileProcessingCodes
from ..models import Import
from ..utilities import (build_summary_json, compute_required_context, ErrorAggregator,
                         ImportTooLargeError, MTYPE_GROUP_TO_CLASS, ParseError, verify_assay_times)
from main.models import (Assay, Line, MeasurementType, MeasurementUnit, Metabolite, MetadataType)
from main.importer.parser import guess_extension, ImportFileTypeFlags
from main.importer.table import ImportBroker

logger = logging.getLogger(__name__)


# maps mtype group to error identifiers for failed lookup
MTYPE_GROUP_TO_ID_ERR = {
    MeasurementType.Group.GENERIC: FileProcessingCodes.MEASUREMENT_TYPE_NOT_FOUND,
    MeasurementType.Group.METABOLITE: FileProcessingCodes.METABOLITE_NOT_FOUND,
    MeasurementType.Group.GENEID: FileProcessingCodes.GENE_ID_NOT_FOUND,
    MeasurementType.Group.PROTEINID: FileProcessingCodes.PROTEIN_ID_NOT_FOUND,
    MeasurementType.Group.PHOSPHOR: FileProcessingCodes.PHOSPHOR_NOT_FOUND,
}


class ImportContext:
    """
    A cache of EDD database and related application context created during the file import process.
    Captures things like EDD MeasurementTypes and special-case Assay metadata used during the
    import process and unlikely to change on the time scale of processing a single import-related
    request.
    """
    def __init__(self, import_, aggregator, user):
        """
        :raises ObjectDoesNotExist if the specified format isn't found
        """
        # look up the database entries for each piece of (mostly user-specified) context from
        # step 1... Not strictly necessary when running synchronously, but we're building this code
        # for simple transition to Celery
        self.user = user
        self.import_ = import_

        self.assay_time_metatype = MetadataType.objects.filter(
            for_context=MetadataType.ASSAY).get(type_name='Time')

        ###########################################################################################
        # Look up the file parser class based on user input
        ###########################################################################################
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
        parser_class_name = self.import_.file_format.parser_class

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
            aggregator.add_error(FileParseCodes.PARSER_NOT_FOUND, occurrence=str(r))
            raise ParseError(self)


class ImportFileHandler(ErrorAggregator):

    def __init__(self, notify, import_, user):
        """

        :raises: ObjectDoesNotExist if any of the provided primary keys don't match the database
        """
        super(ImportFileHandler, self).__init__()
        self.import_ = import_
        self.cache = ImportContext(import_, self, user)
        self.latest_status = None
        self.notify = notify

    def process_file(self, initial_upload):
        """
        Performs initial processing for an import file uploaded to EDD.  The main purpose of this
        method is to parse and resolve the content of the file against data in EDD's database and
        other partner databases, e.g. Uniprot, PubChem, etc. When this method runs to completion,
        the file content has been parsed & staged in the database and Redis cache, along with user
        entries that control import context. This method will either return, or raise an
        EDDImportError.

        Basic steps of the process are:
        1.  Parse the file
        2.  Resolve line or assay names in the file against the study
        3.  Resolve MeasurementUnit & MeasurementType and identifiers
        4.  Identify any missing input required for import completion
        5.  Cache the parsed data in Redis for imminent use
        6.  Build summary JSON for display in the UI
        """
        # TODO: as an enhancement, compute & use file hashes to prevent re-upload

        cache = self.cache
        import_ = self.cache.import_
        file_name = self.import_.file.filename

        ###########################################################################################
        # Parse the file, raising an Exception if any parse / initial verification errors occur
        ###########################################################################################
        parser = self._parse_file()

        # if file format is unknown and parsing so far has only returned row/column data to the UI
        # for display, then just cache the inputs and return
        if not import_.file_format:
            self._notify_format_required(parser, import_, file_name)
            return Import.Status.CREATED

        ###########################################################################################
        # Resolve line / assay names from file to the study
        ###########################################################################################
        logger.info('Resolving identifiers against EDD and reference databases')
        matched_assays = self._verify_line_or_assay_names(parser)

        ###########################################################################################
        # Resolve MeasurementType and MeasurementUnit identifiers from local and/or remote sources
        ###########################################################################################
        self._verify_measurement_types(parser)
        self._verify_units(parser)
        self.raise_errors()

        ###########################################################################################
        # Determine any additional data not present in the file that must be entered by the user
        ###########################################################################################
        assay_pk_to_time = False
        if matched_assays:
            # Detect preexisting assay time metadata, if present. E.g. in the proteomics workflow
            assay_pk_to_time = self._verify_assay_times(parser)

        compartment = cache.import_.compartment
        category = cache.import_.category
        required_inputs = compute_required_context(category, compartment, parser, assay_pk_to_time)

        ###########################################################################################
        # Since import content is now verified & has some value, save the file and context to
        # the database
        ###########################################################################################
        import_.status = Import.Status.READY if not required_inputs else Import.Status.RESOLVED
        import_.save()

        # cache the import in redis for later use
        import_records = self.cache_resolved_import(import_.uuid, parser, matched_assays,
                                                    initial_upload)

        # build the json payload to send back to the UI for use in subsequent import steps
        unique_mtypes = cache.mtype_name_to_type.values()
        payload = build_summary_json(import_, required_inputs, import_records, unique_mtypes,
                                     import_.x_units_id)
        msg = _('Your file "{file_name}" is ready to import').format(file_name=file_name)
        self.notify.notify(msg,
                           tags=['import-status-update'],
                           payload=payload)

    def _parse_file(self):
        file = self.import_.file.file
        mime_type = self.import_.file.mime_type
        file_extension = guess_extension(mime_type)
        file_name = self.import_.file.filename
        study = self.import_.study
        logger.info(f'Parsing import file {file_name} for study {study.pk} ({study.slug}), '
                    f'user {self.cache.user.username}')

        if file_extension not in (ImportFileTypeFlags.EXCEL, ImportFileTypeFlags.CSV):
            self.raise_error(FileParseCodes.UNSUPPORTED_FILE_TYPE, occurrence=file_extension)

        parser = self.cache.parser
        if file_extension == ImportFileTypeFlags.EXCEL:
            parser.parse_excel(file)
        else:
            # work around nonstandard interface for Django's FieldFile
            with file.open('rt') as fp:
                parser.parse_csv(fp)

        return parser

    def _verify_assay_times(self, parser):
        assay_pks = self.cache.loa_name_to_pk.values()
        assay_time_pk = self.cache.assay_time_metatype.pk
        return verify_assay_times(self, assay_pks, parser, assay_time_pk)

    def _notify_format_required(self, parser, import_, file_name):
        payload = {
            'uuid': import_.uuid,
            'status': import_.status,
            'raw_data': parser.raw_data
        }
        message = _('Your import file, "{file_name}" has been saved, but file format input '
                    'is needed to process it').format(file_name=file_name)
        self.notify.notify(message, tags=('import-status-update',), payload=payload)

    def _verify_line_or_assay_names(self, parser):
        line_or_assay_names = parser.unique_line_or_assay_names
        logger.info(f'Searching for {len(line_or_assay_names)} study internals')

        # first try assay names, since some workflows will use them to resolve times (e.g.
        # Proteomics)
        matched_assays = self._verify_line_or_assay_match(line_or_assay_names, lines=False)
        if not matched_assays:
            matched_lines = self._verify_line_or_assay_match(line_or_assay_names, lines=True)
            if not matched_lines:
                self.add_errors(FileProcessingCodes.UNNMATCHED_STUDY_INTERNALS,
                                occurrences=line_or_assay_names)
        return matched_assays

    def _verify_line_or_assay_match(self, line_or_assay_names, lines):
        """
        @:return the number of items in line_or_assay_names that match items in the study
        """

        context = self.cache
        study_pk = context.import_.study_id
        extract_vals = ['name', 'pk']
        if lines:
            qs = Line.objects.filter(study_id=study_pk,
                                     name__in=line_or_assay_names,
                                     active=True).values(*extract_vals)
        else:
            protocol_pk = context.import_.protocol_id
            qs = Assay.objects.filter(study_id=study_pk,
                                      name__in=line_or_assay_names,
                                      protocol_id=protocol_pk,
                                      active=True).values(*extract_vals)
        found_count = qs.count()  # evaluate qs and get the # results
        if found_count:
            model = 'line' if lines else 'assay'
            input_count = len(line_or_assay_names)
            logger.info(f'Matched {found_count} of {input_count} {model} names '
                        f'from the file')
            context.loa_name_to_pk = {result['name']: result['pk'] for result in qs}

            if found_count != input_count:
                if found_count < input_count:
                    names = line_or_assay_names - context.loa_name_to_pk.keys()
                    err_code = (FileProcessingCodes.UNMATCHED_LINE_NAME if lines else
                                FileProcessingCodes.UNMATCHED_ASSAY_NAME)
                else:  # found_count > input_count...find duplicate line names in the study
                    names = (Line.objects.filter(study_id=study_pk)
                             .values('name')  # required for annotate
                             .annotate(count=Count('name'))
                             .filter(count__gt=1)
                             .order_by('name')
                             .values_list('name', flat=True)  # filter out annotation
                             )
                    err_code = (FileProcessingCodes.DUPLICATE_LINE_NAME if lines else
                                FileProcessingCodes.DUPLICATE_ASSAY_NAME)
                self.add_errors(err_code, occurrences=names)

        return bool(found_count)

    def _verify_measurement_types(self, parser):
        # TODO: current model implementations don't allow us to distinguish between different
        # types of errors in linked applications (e.g. connection errors vs permissions errors
        # vs identifier verified not found...consider adding complexity / transparency)

        category = self.cache.import_.category
        mtype_group = category.default_mtype_group
        err_limit = getattr(settings, 'EDD_IMPORT_LOOKUP_ERR_LIMIT', 0)
        err_count = 0
        types_count = len(parser.unique_mtypes)
        types = f': {parser.unique_mtypes}' if types_count <= 10 else f'{types_count} types'
        logger.debug(f'Verifying MeasurementTypes for category "{category.name}"=> '
                     f'type "{mtype_group}"{types}')

        for mtype_id in parser.unique_mtypes:
            try:
                mtype = self._mtype_lookup(mtype_id, mtype_group)
                self.cache.mtype_name_to_type[mtype_id] = mtype
            except ValidationError:
                logger.exception(f'Exception verifying MeasurementType id {mtype_id}')
                err_type = MTYPE_GROUP_TO_ID_ERR.get(mtype_group)
                self.add_error(err_type, occurrence=mtype_id)

                # to maintain responsiveness, stop looking up measurement types after a reasonable
                # number of errors
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
        logger.debug(f'Caching resolved import data to Redis: {import_id}')

        cache = self.cache
        protocol = self.cache.import_.protocol

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
                import_record = self._build_import_record(parse_record, matched_assays)
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
                        self._record_record_clash(parse_record.line_or_assay_name, import_time,
                                                  import_record, parse_record, mtype)
                    elif import_time > parsed_time:
                        insert_index = index
                        break
                if insert_index is not None:
                    import_series.insert(insert_index, parse_record.data)
                else:
                    import_series.append(parse_record.data)

        self.raise_errors()   # raise any errors detected during the merge (e.g. duplicate entries)

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

    def _build_import_record(self, parse_record, matched_assays):
        assay_or_line_pk = self.cache.loa_name_to_pk.get(parse_record.line_or_assay_name)
        mtype = (self.cache.mtype_name_to_type[parse_record.mtype_name] if
                 parse_record.mtype_name else None)
        unit = (self.cache.unit_name_to_unit[parse_record.units_name] if
                parse_record.units_name else None)
        import_record = {
            # TODO: vestiges of the older import? consider also, e.g. Biolector
            # 'kind': 'std',
            # 'hint': None,

            'measurement_id': mtype.pk,
            'compartment_id': self.cache.import_.compartment,
            'units_id': unit.pk,
            'data': [parse_record.data],
            'src_ids': []  # ids for where the data came from, e.g. row #s in an Excel file
        }

        protocol = self.cache.import_.protocol

        if matched_assays:
            import_record['assay_id'] = assay_or_line_pk
        else:
            line_pk = assay_or_line_pk
            import_record['assay_id'] = 'new'
            import_record['line_id'] = line_pk
            import_record['protocol_id'] = protocol.pk
            assays = Assay.objects.filter(line_id=line_pk,
                                          protocol_id=protocol.pk).values_list('name')
            if assays:
                self.raise_errors(FileProcessingCodes.MERGE_NOT_SUPPORTED,
                                  occurrences=assays)

        return import_record

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

    def _record_record_clash(self, loa_name, import_time, import_record, parse_record,
                             mtype):
        occurrences = []
        if len(import_record['src_ids']) == 1:
            occurrences.extend(import_record['src_ids'])
        occurrences.append(parse_record.src_id)
        self.add_errors(FileProcessingCodes.MEASUREMENT_COLLISION,
                        f'({loa_name}: {mtype.type_name}, T={import_time})',
                        occurrences=occurrences)
        return True
