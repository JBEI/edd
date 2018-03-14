# coding: utf-8

import collections
import copy
import logging
from collections import defaultdict, OrderedDict, Sequence

from arrow import utcnow
from django.db.models import Q
from future.utils import viewitems, viewvalues
from six import string_types

from main.models import Assay, Line, MetadataType, Protocol, Strain
from .constants import (
    BAD_GENERIC_INPUT_CATEGORY,
    ILLEGAL_RELATED_FIELD_REFERENCE,
    INTERNAL_EDD_ERROR_CATEGORY,
    INVALID_ASSAY_META_PK,
    INVALID_LINE_META_PK,
    INVALID_PROTOCOL_META_PK,
    INVALID_RELATED_FIELD_REFERENCE,
    NAME_ELT_REPLICATE_NUM,
    NON_UNIQUE_STRAIN_UUIDS,
    SUSPECTED_MATCH_STRAINS,
    UNMATCHED_PART_NUMBER,
    ZERO_REPLICATES,
)


logger = logging.getLogger(__name__)


class NamingStrategy(object):
    """
    The abstract base class for different line/assay naming strategies. Provides a generic
    framework for use in different naming strategies used in template file upload and the eventual
    combinatorial line creation GUI (EDD-257).
    """
    def __init__(self, cache, importer):
        self.cache = cache
        self.importer = importer
        self.section_separator = '-'
        self.multivalue_separator = '_'
        self.space_replacement = '_'
        self.combinatorial_input = None
        self.fractional_time_digits = 0
        self.require_strains = False

    def get_line_name(self, line_metadata, replicate_num):
        """
        :param strains_by_pk:
        :raises ValueError if some required input isn't available for creating the name (either
            via this method or from other properties). Note that even if required for line name
            uniqueness, strain names may be omitted.
        """
        raise NotImplementedError()  # require subclasses to implement

    def get_assay_name(self, line, protocol_pk, assay_metadata):
        """
        :raises ValueError if some required input isn't available for creating the name (either
            via this method or from other properties)
        """
        raise NotImplementedError()  # require subclasses to implement

    def _get_abbrev(self, field_id, raw_value):
        # not supported by ED file, overridden by AutomatedNamingStrategy
        return raw_value

    def get_required_naming_meta_pks(self):
        """
        Gets the primary keys of MetadataTypes required as input to line/assay naming
        """
        raise NotImplementedError('')

    def build_related_objects_name_segment(self, line_metadata, line_meta_pk,
                                           related_obj_attr_name, field_source_detail):
        """
        Builds a line name segment for one or more related Django model objects associated with
        a Line attribute identified by line_meta_pk.
        which is required for computing a unique name for the line.

        Note that EDD ships with special built-in MetadataTypes that describe Line attributes (e.g.
        "Strain(s)", "Carbon Source").
        :param line_metadata: a dict of metadata pk -> value identifiers(s) to be set on the
        line.  It's assumed to contain pks of related objects for line_meta_pk.
        :param line_meta_pk: the meta pk corresponding to the related object field
        :param related_obj_attr_name: the name of the Line-related attribute whose value should be
        used in the name (e.g. 'name' for line__strains__name.)
        :param field_source_detail: a string that contains human-readable details of how the
                                    related field input was received, for use in constructing
                                    helpful error messages.(e.g. the json element for the
                                    combinatorial GUI, or the Excel column header for
                                    Experiment Description).
        :return: the name segment
        """
        importer = self.importer
        cache = self.cache
        line_meta_types = cache.line_meta_types

        line_meta_type = line_meta_types[line_meta_pk]
        line_attr_name = line_meta_type.type_field
        if line_attr_name not in ALLOWED_RELATED_OBJECT_FIELDS:
            importer.add_error(BAD_GENERIC_INPUT_CATEGORY,
                               ILLEGAL_RELATED_FIELD_REFERENCE,
                               field_source_detail)
        elif related_obj_attr_name not in ALLOWED_RELATED_OBJECT_FIELDS[line_attr_name]:
            importer.add_error(BAD_GENERIC_INPUT_CATEGORY,
                               INVALID_RELATED_FIELD_REFERENCE, field_source_detail)
        if importer.errors:
            raise ValueError('Invalid input')

        # process ManyRelatedFields
        if line_meta_pk in cache.many_related_mtypes:
            value_ids = line_metadata[line_meta_pk]

            related_objects = cache.get_related_objects(line_meta_pk, value_ids)

            # build a list of line name subsegments corresponding to each related object
            names_list = []
            for related_object in related_objects:
                related_obj_attr = getattr(related_object, related_obj_attr_name)
                names_list.append(str(related_obj_attr))

            abbrev_vals = [self._get_abbrev(field_source_detail, single_name)
                           for single_name in names_list]
            return self.multivalue_separator.join(abbrev_vals).replace(
                ' ', self.space_replacement)

        # process single-valued foreign key fields
        else:
            identifier = line_metadata.get(line_meta_pk)
            line_attr = Line._meta.get_field(line_attr_name)
            related_model_class = line_attr.related_model

            # TODO: seems likely that newer initial lookup/ cacheing removes the need to query
            raw_value = related_model_class.objects.filter(pk=identifier).values_list(
                related_obj_attr_name, flat=True).get()
            raw_value = raw_value.replace(' ', self.space_replacement)
            return self._get_abbrev(field_source_detail, raw_value)


class NewLineAndAssayVisitor(object):
    """
    A simple abstract Visitor class for use during actual or simulated Line and Assay creation.
    """

    def __init__(self, study_pk, replicate_count, omit_all_strains=False,
                 omit_missing_strains=False):
        self.study_pk = study_pk
        # maps line name -> protocol_pk -> [ Assay ]
        self.line_to_protocols_to_assays_list = defaultdict(lambda: defaultdict(list))
        self.replicate_count = replicate_count
        self.omit_missing_strains = omit_missing_strains
        self.omit_all_strains = omit_all_strains

    def visit_line(self, line_name, description, line_metadata_dict,
                   replicate_num):
        raise NotImplementedError()  # require subclasses to implement

    def visit_assay(self, protocol_pk, line, assay_name, assay_metadata_dict):
        raise NotImplementedError()  # require subclasses to implement

    def get_assays_list(self, line_name, protocol_pk):
        protocols_to_assays_list = self.line_to_protocols_to_assays_list.get(line_name, None)

        if not protocols_to_assays_list:
            return []

        return protocols_to_assays_list.get(protocol_pk, [])


class LineAndAssayCreationVisitor(NewLineAndAssayVisitor):
    """
    A NewLineAndAssayVisitor that's responsible for database I/O to create new Lines and Assays
    for both the "generate lines" GUI or Experiment Description file upload.
    """
    def __init__(self, study_pk, cache, replicate_count, omit_all_strains=False,
                 omit_missing_strains=False):
        super(LineAndAssayCreationVisitor, self).__init__(
            study_pk,
            replicate_count,
            omit_missing_strains=omit_missing_strains,
            omit_all_strains=omit_missing_strains
        )
        self.lines_created = []
        self.require_strains = True
        self.cache = cache

    def visit_line(self, line_name, description, line_metadata_dict, replicate_num):

        cache = self.cache

        # Create a dict for all native Line attributes and 1-to-1 related object fields. In some
        #  cases, this will allow us to complete work on the line in a single database query

        # build an hstore-compliant metadata dictionary, omitting metadata values that represent
        # 1-to-M or M2M relations, which can't be set until after a Line pk is
        # defined
        hstore_compliant_dict = {
            str(pk): cache.line_meta_types.get(pk).encode_value(value)
            for pk, value in viewitems(line_metadata_dict)
            if value and pk not in cache.related_objects
        }

        line_attrs = {
            'name': line_name,
            'description': description,
            'study_id': self.study_pk,
            'meta_store': hstore_compliant_dict,
        }

        # add in values for single-valued relations captured by specialized MetadataTypes
        for meta_type_pk, meta_type in viewitems(cache.related_object_mtypes):
            value_pks = line_metadata_dict.get(meta_type_pk)

            if not value_pks or meta_type_pk in cache.many_related_mtypes:
                continue

            values = cache.get_related_objects(meta_type_pk, value_pks)

            # unpack what should be single-valued items returned as a list
            if meta_type_pk not in cache.many_related_mtypes:
                values = values[0]

            line_attrs[meta_type.type_field] = values

        # create the line.  This must be done before setting M2M relations, so they'll have a
        # line pk to use
        line = Line.objects.create(**line_attrs)

        # save M2M and 1-to-M relations. Note: This MUST be done after Line is saved to the
        # database and has a primary key to use in relation tables
        for pk, meta_type in viewitems(self.cache.many_related_mtypes):
            value_pks = line_metadata_dict.get(pk)
            if not value_pks:
                continue

            is_strains = meta_type.pk == cache.strains_mtype.pk
            if is_strains and self.omit_all_strains:
                continue

            ignore_missing_strains = is_strains and (self.omit_missing_strains or
                                                     self.omit_all_strains)
            values = cache.get_related_objects(pk, value_pks,
                                               subset=ignore_missing_strains)
            if not values:
                continue

            many_related_mtype = cache.many_related_mtypes[pk]

            # note: line.metadata_add doesn't support multiple values in a single
            # query...TypeError.  Resulting method would be too complex with this feature?
            # TODO: ponder changing line.meta_add(values) -> meta_add(*values)
            line_attr = getattr(line, many_related_mtype.type_field)
            line_attr.add(*values)  # add in bulk, which will leave the line instance out of sync

        self.lines_created.append(line)

        return line

    def visit_assay(self, protocol_pk, line, assay_name, assay_metadata_dict):
        protocol_to_assays_list = self.line_to_protocols_to_assays_list[line.name]
        assays_list = protocol_to_assays_list[protocol_pk]

        # make sure everything gets cast to str to comply with Postgres' hstore field
        hstore_compliant_dict = {
            str(pk): str(value)
            for pk, value in viewitems(assay_metadata_dict) if value
        }

        assay = Assay.objects.create(
            name=assay_name,
            line_id=line.pk,
            protocol_id=protocol_pk,
            meta_store=hstore_compliant_dict
        )
        assays_list.append(assay)


class LineAndAssayNamingVisitor(NewLineAndAssayVisitor):
    """
    A NewLineAndAssayVisitor that computes Line and Assay names to be created, without actually
    making any database modifications. This supports line/assay naming preview functionality needed
    for the eventual combinatorial line creation GUI (EDD-257).
    """
    def __init__(self, study_pk, replicate_count, omit_all_strains=False,
                 omit_missing_strains=False):
        super(LineAndAssayNamingVisitor, self).__init__(study_pk, replicate_count,
                                                        omit_missing_strains, omit_all_strains)
        # same names as in self.line_to_protocols_to_assays_list, but having this allows us to
        # detect duplicates
        self.line_names = []
        self.lines = []

    def visit_line(self, line_name, description, line_metadata_dict, replicate_num):

        self.line_names.append(line_name)

        # cache the line name (it's a defaultdict, so this line has an effect)
        self.line_to_protocols_to_assays_list[line_name]

        # construct, but don't save, a Line instance as a simple way to pass around all the
        # resultant metadata (e.g. in case it's used later in assay naming). These few lines
        # should be the only duplicated code for computing names vs. actually creating the
        # database objects.
        # TODO: consider using line.meta_add() instead to properly handle line field values
        # provided as metadata
        line = Line(
            name=line_name,
            description=description,
            study_id=self.study_pk,
            meta_store=line_metadata_dict,
        )

        self.lines.append(line)

        return line

    def visit_assay(self, protocol_pk, line, assay_name, assay_metadata_dict):
        # cache the new assay names, along with associations to the related lines / protocols.
        # note that since Lines aren't actually created, we have to use names as a unique
        # identifier (a good assumption since we generally want / have coded the context here to
        # prevent duplicate line / assay naming via combinatorial creation tools.
        protocol_to_assay_names = self.line_to_protocols_to_assays_list[line.name]
        assay_names = protocol_to_assay_names[protocol_pk]
        assay_names.append(assay_name)


NAMING_ELT_STRAINS = 'strain'
_RELATED_OBJ_SEPARATOR = '__'

# define a whitelist of related object fields that can be used as input for line naming.
# this prevents security problems (e.g. accessing user passwords). Note that for initial
# simplicity, this approach purposefully limits us to direct relationships to lines.
# E.g. not contact__userprofile__initials, though that's also possible/useful.
ALLOWED_RELATED_OBJECT_FIELDS = {
    'contact': ('last_name'),
    'experimenter': ('last_name'),
    'strains': ('name'),
    'carbon_source': ('name'),
}


class ExperimentDescriptionContext(object):
    """
    Captures database and ICE context queried during the Experiment Description process
    and cached to avoid repetitive lookups during line creation. All the data stored in this class
    can be assumed to be static over the time period during which line creation occurs (seconds to
    low minutes).
    """
    def __init__(self):

        # build up a dictionary of protocols
        self.protocols = {protocol.pk: protocol for protocol in Protocol.objects.all()}

        # build up dictionaries of Line and Assay metadata types
        line_metadata_qs = MetadataType.objects.filter(for_context=MetadataType.LINE)
        self.line_meta_types = {
            meta_type.pk: meta_type
            for meta_type in line_metadata_qs
        }

        self.assay_meta_types = {
            meta_type.pk: meta_type
            for meta_type in MetadataType.objects.filter(for_context=MetadataType.ASSAY)
        }

        self.strains_mtype = MetadataType.objects.filter(
            for_context=MetadataType.LINE).get(type_name='Strain(s)')

        self.carbon_sources_mtype = MetadataType.objects.filter(
            for_context=MetadataType.LINE).get(type_name='Carbon Source(s)')
        ##################################################

        self.assay_time_mtype = MetadataType.objects.filter(
            for_context=MetadataType.ASSAY).get(type_name='Time')

        # get related MetadataTypes that describe related object fields
        relation_mtypes = self.query_related_object_types(
            self.line_meta_types)

        # pk -> MetadataType for all Line relations (including M2M below)
        self.related_object_mtypes = relation_mtypes[0]

        # pk -> MetadataType for M2M Line relations with a MetadataType analog
        self.many_related_mtypes = relation_mtypes[1]

        self.related_objects = {}  # maps mtype pk -> related object pk -> related object

    @staticmethod
    def query_related_object_types(line_meta_types):
        """ Inspects the provided line metadata types to find those correspond to
            ManyRelatedFields (e.g. Strain, CarbonSource) that may also be used in line naming
            or needed to set foreign key relations
        """
        many_related_mtypes = {}
        related_object_mtypes = {}
        for meta_pk, meta_type in viewitems(line_meta_types):
            if meta_type.type_field:
                line_attr = Line._meta.get_field(meta_type.type_field)

                if not line_attr.is_relation:
                    continue

                related_object_mtypes[meta_pk] = meta_type
                if line_attr.many_to_many or line_attr.one_to_many:
                    many_related_mtypes[meta_pk] = meta_type

        return related_object_mtypes, many_related_mtypes

    def clear_import_specific_cache(self):
        """
        Clears data from the cache that are the result of specific inputs in this combinatorial
        creation attempt
        """
        logger.debug('Clearing import-specific cache')
        self.related_objects = {}

    def get_related_objects(self, mtype_pk, value_pks, subset=False):
        """
        Gets Line-related model objects from the in-memory cache

        :param mtype_pk: the MetadataType pk to get cached model object instances for
        :param value_pks: a single primary key, or an iterable of primary keys for related
                          objects to get from the cache.
        :param subset: True to return the subset of requested values that were found in the
                         cache, False to raise KeyError if any requested object was missing from
                         the cache
        :return: a list of model objects found in the cache (may be a subset as dictated by
                        "optional"
        :raises: KeyError if "optional" is false and a requested key isn't in the cache
        """

        # regardless of its input format, extract a flattened set of primary keys from value_pks.
        # this is essentially unrolling the JSON output from the combinatorial GUI, or analagous
        # in-memory storage of combinatorial (+\- group) strain/carbon source pks used by ED files
        if isinstance(value_pks, Sequence) and not isinstance(value_pks, string_types):
            pks_set = set(value_pks)
        else:
            pks_set = set([value_pks])

        # common use is to expect all values to be cached and fail if they aren't
        # TODO: this is essentially a 3-LOC stopgap for getting integration tests up and running
        # for strain error processing & related workarounds when contacting ICE.  Once we have
        # fully independent/automated verification of that, We can go to just always returning the
        # subset of cached objects that were found.  For now, this is important for detecting
        # errors during maintenance of complex surrounding code
        if not subset:
            mtype_vals = self.related_objects[mtype_pk]
            return [mtype_vals[item_pk] for item_pk in pks_set]

        # special case is to go forward and use whatever subset was found
        mtype_vals = self.related_objects.get(mtype_pk, {})
        if not mtype_vals:
            return []

        result = []
        for pk in pks_set:
            cached_obj = mtype_vals.get(pk)
            if cached_obj:
                result.append(cached_obj)
        return result

    @property
    def strains_by_pk(self):
        if not self.related_objects:
            return None

        return self.related_objects[self.strains_mtype.pk]

    @strains_by_pk.setter
    def strains_by_pk(self, strains_by_pk):
        strains_mtype = self.strains_mtype
        self.related_objects[strains_mtype.pk] = strains_by_pk


class AutomatedNamingStrategy(NamingStrategy):
    """
    An automated naming strategy for line/assay naming during combinatorial line/assay
    creation (but NOT Experiment Description file upload, which uses
    _ExperimentDescNamingStrategy).
    The user specifies the order of items in the line/assay names, then names are generated
    automatically.
    """

    def __init__(self, importer, cache, naming_elts=None, custom_name_elts={},
                 abbreviations=None, ):
        super(AutomatedNamingStrategy, self).__init__(cache, importer)
        self.elements = naming_elts
        self.abbreviations = abbreviations
        self.custom_name_elts = custom_name_elts

    def get_required_naming_meta_pks(self):
        # parse out line metadata pks from naming element strings, also verifying that only
        # allowed related object fields are provided
        importer = self.importer

        related_obj_meta_pks = set()
        for element in self.elements:
            if not isinstance(element, string_types):
                continue
            tokens = element.split(_RELATED_OBJ_SEPARATOR)
            if len(tokens) == 2:
                line_meta_pk, related_obj_attr_name = tokens
                line_meta_pk = int(line_meta_pk)

                line_meta_type = self.cache.line_meta_types[line_meta_pk]
                line_attr_name = line_meta_type.type_field
                if line_attr_name not in ALLOWED_RELATED_OBJECT_FIELDS:
                    importer.add_error(BAD_GENERIC_INPUT_CATEGORY,
                                       ILLEGAL_RELATED_FIELD_REFERENCE,
                                       element)
                elif related_obj_attr_name not in ALLOWED_RELATED_OBJECT_FIELDS[line_attr_name]:
                    importer.add_error(BAD_GENERIC_INPUT_CATEGORY,
                                       INVALID_RELATED_FIELD_REFERENCE, element)
                if importer.errors:
                    raise ValueError('Invalid input')

                related_obj_meta_pks.add(line_meta_pk)
        return related_obj_meta_pks

    def get_line_name(self, line_metadata, replicate_num):
        """
        Constructs a name for the specified line based on the order of naming elements explicitly
        specified by the client.
        """
        line_name = None

        for field_id in self.elements:
            append_value = ''

            if isinstance(field_id, int):
                # raises ValueError if not found per docstring
                meta_value = line_metadata.get(field_id)
                if meta_value is None:
                    raise ValueError('No value found for metadata field with id %(value)s '
                                     '(%(type)s)' % {
                                        'value': field_id,
                                        'type': field_id.__class__.__name__})
                append_value = self._get_abbrev(field_id, meta_value)

            else:
                # if this naming element takes the value of a related object field as input,
                # verify that it's in the whitelist of supported related object fields,
                # then look it up.  For example X__last_name is valid, where X is the pk for
                # line experimenter metadata
                tokens = field_id.split(_RELATED_OBJ_SEPARATOR)
                if len(tokens) == 2:
                    line_meta_pk, related_obj_attr_name = tokens
                    line_meta_pk = int(line_meta_pk)
                    append_value = self.build_related_objects_name_segment(line_metadata,
                                                                           line_meta_pk,
                                                                           related_obj_attr_name,
                                                                           field_id)

                # if this naming element doesn't use the value of a related object field,
                # just process it normally
                elif len(tokens) == 1:
                    if NAME_ELT_REPLICATE_NUM == field_id:
                        # NOTE: passing raw number causes a warning
                        append_value = self._get_abbrev(field_id, 'R%d' % replicate_num)
                    elif field_id in self.custom_name_elts:
                        append_value = self._get_abbrev(field_id, self.custom_name_elts[field_id])
                    else:
                        raise ValueError('No value found for metadata field with id %s' % field_id)
                else:
                    raise ValueError()  # TODO: better error message?

            if not line_name:
                line_name = append_value
            else:
                line_name = self.section_separator.join((line_name, append_value))

        return line_name

    def get_missing_line_metadata_fields(self, common_line_metadata, combinatorial_line_metadata,
                                         missing_metadata_fields):
        for field_id in self.elements:
            if field_id in common_line_metadata:
                continue
            if field_id not in combinatorial_line_metadata:
                missing_metadata_fields.append(field_id)

    def get_missing_assay_metadata_fields(self, common_assay_metadata,
                                          combinatorial_assay_metadata):
        # NOTE: missing line metadata fields will prevent assays from being named too,
        # but not checked here
        cache = self.cache
        assay_time_pk = cache.assay_time_metadata_type_pk
        common_value = common_assay_metadata.get(assay_time_pk, None)
        if common_value:
            return []
        combinatorial_values = combinatorial_assay_metadata.get(assay_time_pk, None)
        if not combinatorial_values:
            return [cache.assay_time_metadata_type_pk]

    def _get_abbrev(self, field_id, raw_value):
        """
        Gets the abbreviated value to use for this field/value combination, or
        returns raw_value if there's no corresponding abbreviation. Regardless of whether an
        abbreviation is applied, the result is guaranteed to always be a string.
        """
        values = self.abbreviations.get(field_id, None)

        # convert raw_value to a string since that's always what we want for line name input,
        # and for easy comparison against abbreviation keys which are converted to strings in
        # __init__() to avoid problems on the JS side (can't create string values as numbers)
        raw_value = str(raw_value)
        if not values:
            return raw_value

        abbreviation = values.get(raw_value)
        if abbreviation:

            # tolerate values that may have been provided as ints, for example
            return str(abbreviation)
        return raw_value

    def get_assay_name(self, line, protocol_pk, assay_metadata):
        time_pk = self.cache.assay_time_mtype
        # TODO: reconsider assay configuration / naming in the GUI when implementing, then
        # update placeholder implementation here.  Pre-measurement assay creation wasn't under
        # discussion until after creating the combinatorial UI mockup attached to EDD-257
        logger.info('Assay metadata: %s' % assay_metadata)
        assay_time = assay_metadata.get(time_pk, None)
        if not assay_time:
            raise ValueError('No time value was found -- unable to generate an assay name')
        return self.section_separator.join((line.name, '%sh' % str(assay_time)))


class CombinatorialDescriptionInput(object):
    """
    Defines the set of inputs required to combinatorially create Lines and Assays for a Study.
    """

    def __init__(self, naming_strategy, importer, description=None, replicate_count=1,
                 common_line_metadata={}, combinatorial_line_metadata=defaultdict(list),
                 protocol_to_assay_metadata={}, protocol_to_combinatorial_metadata={}):
        """
        :param naming_strategy: a NamingStrategy instance used to compute line/assay names from a
            combination of user input and information from the database (e.g. protocol names).
        :param description: an optional string to use as the description for all lines created.
        :param replicate_count: an integer number of replicate lines to create for each unique
            combination of line properties / metadata.
        :param common_line_metadata:
        :param combinatorial_line_metadata:
        :param protocol_to_assay_metadata:
        :param protocol_to_combinatorial_metadata:
        """
        self.importer = importer

        ###########################################################################################
        # common input that can apply equally to Lines and the related Assays
        ###########################################################################################
        naming_strategy.combinatorial_input = self
        self.naming_strategy = naming_strategy

        ###########################################################################################
        # line-specific metadata
        ###########################################################################################
        # only a single value is supported -- doesn't make sense to do this combinatorially
        self.description = description

        # sequences of ICE part ID's readable by users
        self.replicate_count = replicate_count
        self.common_line_metadata = copy.copy(common_line_metadata)

        # maps MetadataType pk -> []
        self.combinatorial_line_metadata = copy.copy(combinatorial_line_metadata)

        ###########################################################################################
        # protocol-specific metadata
        ###########################################################################################
        self.unique_protocols = set(protocol_to_assay_metadata)
        self.unique_protocols.update(protocol_to_combinatorial_metadata)

        # optional. maps protocol pk -> { MetadataType.pk -> [values] }
        self.protocol_to_assay_metadata = defaultdict(lambda: defaultdict(list))
        self.protocol_to_assay_metadata.update(protocol_to_assay_metadata)

        # maps protocol_pk -> assay metadata pk -> list of values
        self.protocol_to_combinatorial_metadata_dict = defaultdict(lambda: defaultdict(list))
        self.protocol_to_combinatorial_metadata_dict.update(protocol_to_combinatorial_metadata)

    @property
    def fractional_time_digits(self):
        return self.naming_strategy.fractional_time_digits

    @fractional_time_digits.setter
    def fractional_time_digits(self, count):
        self.naming_strategy.fractional_time_digits = count

    def get_required_naming_meta_pks(self):
        return self.naming_strategy.get_required_naming_meta_pks()

    def get_related_object_ids(self, line_meta_pk, result=None):
        """
        Builds the set of unique ID's for Line-related objects defined by the line MetadataType
        with the given primary key.
        :param result: an optional existing set to populate with results from this input. If None,
        a new set will be created.
        """
        if result is None:
            result = set()

        # get common metadata values. even for multivalue-supporting metadata types,
        # common metadata will at most be a list of identifiers
        values = self.common_line_metadata.get(line_meta_pk)
        if values:
            if isinstance(values, collections.Iterable) and not isinstance(values, string_types):
                result.update(values)
            else:
                result.add(values)

        # get combinatorial metadata values, which may be more complex. for multivalue-supporting
        # metadata types (e.g. strain), we may have a list of lists of ID's
        values = self.combinatorial_line_metadata.get(line_meta_pk)
        if not values:
            return result

        if isinstance(values, collections.Iterable) and not isinstance(values, string_types):
            for elt in values:
                if (isinstance(elt, collections.Iterable)
                        and not isinstance(elt, string_types)):
                    for val in elt:
                        result.add(val)  # can't do result.update(list)
                else:
                    result.add(elt)
        else:
            result.add(values)

        return result

    def replace_ice_ids_with_edd_pks(self, edd_strains_by_ice_id, ice_parts_by_id,
                                     strains_mtype_pk):
        """
        Replaces part-number-based strain entries with pk-based entries and converts any
        single-item strain groups into one-item lists for consistency. Also caches strain
        references for future use by this instance on the assumption that they are not going
        to change.
        """
        logger.info(f'Pre-replacement combinatorial metadata: {self.combinatorial_line_metadata}')
        self._replace_ice_ids_with_edd_pks(self.combinatorial_line_metadata, strains_mtype_pk,
                                           edd_strains_by_ice_id, ice_parts_by_id,
                                           is_combinatorial=True)
        logger.info(f'Post-replacement combinatorial metadata: {self.combinatorial_line_metadata}')

        logger.info(f'Pre-replacement common metadata: {self.common_line_metadata}')
        self._replace_ice_ids_with_edd_pks(self.common_line_metadata, strains_mtype_pk,
                                           edd_strains_by_ice_id, ice_parts_by_id)
        logger.info(f'Post-replacement common metadata: {self.common_line_metadata}')

    def _replace_ice_ids_with_edd_pks(self, line_metadata_src, strains_mtype_pk,
                                      edd_strains_by_ice_id, ice_parts_by_id,
                                      is_combinatorial=False):
        """
        Replaces ICE UUIDs or part ID's from the input with EDD primary keys.
        """

        # traverse metadata, with some tolerance for input format, and for necessarily different
        #  storage of combinatorial / common line metadata.
        strain_id_groups = line_metadata_src.get(strains_mtype_pk)

        if not strain_id_groups:
            return

        # if strain metadata only contains a single item, wrap it in a list for consistency
        if (not isinstance(strain_id_groups, collections.Sequence)) or isinstance(
                strain_id_groups, string_types):
            strain_id_groups = [strain_id_groups]
            line_metadata_src[strains_mtype_pk] = strain_id_groups

        # common line metadata will only have a single strain or list of strains
        if not is_combinatorial:
            self._replace_ice_ids(strain_id_groups, edd_strains_by_ice_id, ice_parts_by_id)
            return

        # combinatorial line metadata should be a list of strain lists, since each line can contain
        # multiple strains
        for group_index, ice_id_list in enumerate(strain_id_groups):
            if (not isinstance(ice_id_list, collections.Sequence)) or isinstance(ice_id_list,
                                                                                 string_types):
                ice_id_list = [ice_id_list]
                strain_id_groups[group_index] = ice_id_list

            self._replace_ice_ids(ice_id_list, edd_strains_by_ice_id, ice_parts_by_id)

    def _replace_ice_ids(self, ice_id_list, edd_strains_by_ice_id, ice_parts_by_id):
        for index, ice_id in enumerate(ice_id_list):
            logger.debug('ice_id: %s' % ice_id)
            strain = edd_strains_by_ice_id.get(ice_id, None)
            if strain:
                ice_id_list[index] = strain.pk

            # Do an efficient double-check for consistency with complex surrounding code:
            # if ICE identifier is present in input, but *was* found in ICE, this is a
            # coding/maintenance error in the surrounding code. Parts NOT found in ICE
            # should already have resulted in error/warning messages
            # during the preceding ICE queries, and we don't need to track two errors for
            # the same problem.
            elif ice_id in ice_parts_by_id:
                logger.error('ICE ID %s was found in ICE, but not in EDD. EDD strains are %s' %
                             (ice_id, edd_strains_by_ice_id))  # TODO: remove debug stmt
                self.importer.add_error(INTERNAL_EDD_ERROR_CATEGORY, UNMATCHED_PART_NUMBER, ice_id)

    def add_common_line_metadata(self, line_metadata_pk, value):
        self.common_line_metadata[line_metadata_pk] = value

    def add_combinatorial_line_metadata(self, line_metadata_pk, value):
        values_list = self.combinatorial_line_metadata[line_metadata_pk]
        values_list.append(value)

    def add_common_assay_metadata(self, protocol_pk, assay_metadata_pk, value):
        values_list = self.get_common_assay_metadata_list(protocol_pk, assay_metadata_pk)
        values_list.append(value)
        self.unique_protocols.add(protocol_pk)

    def add_combinatorial_assay_metadata(self, protocol_pk, assay_metadata_pk, value):
        values_list = self.get_combinatorial_assay_metadata_list(protocol_pk, assay_metadata_pk)
        values_list.append(value)
        self.unique_protocols.add(protocol_pk)

    def get_combinatorial_assay_metadata_list(self, protocol_pk, assay_metadata_pk):
        """
        Gets the list of combinatorial assay metadata values for the specified protocol /
        MetadataType, or creates and returns an empty one if none exists.

        :param protocol_pk:
        :param assay_metadata_pk:
        :return: the list of combinatorial metadata values. Note that changes to this list from
            client code will be persistent / visible to other users of this instance
        """
        return self.protocol_to_combinatorial_metadata_dict[protocol_pk][assay_metadata_pk]

    def get_common_assay_metadata_list(self, protocol_pk, assay_metadata_pk):
        return self.protocol_to_assay_metadata[protocol_pk][assay_metadata_pk]

    def has_assay_metadata_type(self, protocol_pk, metadata_type_pk):
        return metadata_type_pk in self.protocol_to_assay_metadata.get(protocol_pk, [])

    def verify_pks(self, cache, importer):
        """
        Examines all primary keys cached in this instance and compares them against reference
        dictionaries provided as input.  Any primary keys that don't match the expected values
        will cause an error message to be added to the importer parameter. Note that this
        checking is necessary prior to inserting primary key values into the database's "hstore"
        field, but it's possible for it to miss new primary keys inserted into the database or old
        ones removed since the cached values provided in the parameters were originally queried
        from the database.
        """

        line_metadata_types_by_pk = cache.line_meta_types
        assay_metadata_types_by_pk = cache.assay_meta_types
        protocols_by_pk = cache.protocols

        #############################
        # common line metadata
        #############################
        self._verify_pk_keys(
            self.common_line_metadata,
            line_metadata_types_by_pk,
            importer,
            INVALID_LINE_META_PK,
        )

        #############################
        # combinatorial line metadata
        #############################
        self._verify_pk_keys(
            self.combinatorial_line_metadata,
            line_metadata_types_by_pk,
            importer,
            INVALID_LINE_META_PK,
        )

        #############################
        # common assay metadata
        #############################
        self._verify_pk_keys(
            self.protocol_to_assay_metadata,
            protocols_by_pk,
            importer,
            INVALID_PROTOCOL_META_PK,
        )

        for protocol_pk, input_assay_metadata_dict in viewitems(self.protocol_to_assay_metadata):
            self._verify_pk_keys(
                input_assay_metadata_dict,
                assay_metadata_types_by_pk,
                importer,
                INVALID_ASSAY_META_PK,
            )

        #################################
        # combinatorial assay metadata
        #################################
        self._verify_pk_keys(
            self.protocol_to_combinatorial_metadata_dict,
            protocols_by_pk,
            importer,
            INVALID_PROTOCOL_META_PK,
        )

        for protocol_pk, metadata_dict in viewitems(self.protocol_to_combinatorial_metadata_dict):
            self._verify_pk_keys(
                metadata_dict,
                assay_metadata_types_by_pk,
                importer,
                INVALID_ASSAY_META_PK,
            )

    @staticmethod
    def _verify_pk_keys(input_dict, reference_dict, importer, err_key):
        for id in input_dict:
            if id not in reference_dict:
                importer.add_error(INTERNAL_EDD_ERROR_CATEGORY, err_key, id)

    def compute_line_and_assay_names(self, study, cache, options):
        """
        Computes all line and assay names that would be created by this
        CombinatorialDescriptionInput without actually making any database modifications.
        :param study: the study
        :return: a LineAndAssayNamingVisitor that contains information on all pending Line and
        Assay names.
        """
        visitor = LineAndAssayNamingVisitor(study.pk, self.replicate_count,
                                            omit_missing_strains=options.ignore_ice_access_errors,
                                            omit_all_strains=options.omit_all_strains)
        self._visit_study(visitor, cache)
        return visitor

    def populate_study(self, study, cache, options):
        """
        Creates objects in the database, or raises an Exception if an unexpected error occurs.
        Note that the basic assumption of this method is that regardless of the original input
        method, strain identifiers in this instance have been matched to local numeric primary keys
        and that all error checking has already been completed.

        This method strictly performs database I/O that's expected to succeed.
        """
        visitor = LineAndAssayCreationVisitor(
            study.pk, cache, self.replicate_count,
            omit_missing_strains=options.ignore_ice_access_errors,
            omit_all_strains=options.omit_all_strains)

        self._visit_study(visitor, cache)
        return visitor

    def _visit_study(self, visitor, cache):

        # pass cached database values to the naming strategy, if relevant.
        self.naming_strategy.cache = cache
        self._cache = cache

        ###########################################################################################
        # Visit all lines and assays in the study
        ###########################################################################################
        try:
            self._visit_new_lines(visitor)

        ###########################################################################################
        # Clear out local caches of database info
        ###########################################################################################
        finally:
            self.naming_strategy.cache = None
            self._cache = None

    def _visit_new_lines(self, visitor):
            line_metadata = copy.copy(self.common_line_metadata)
            unvisited_meta_pks = set(self.combinatorial_line_metadata.keys())
            self._visit_new_lines_helper(line_metadata, unvisited_meta_pks, visitor)

    def _visit_new_lines_helper(self, line_metadata, unvisited_meta_pks, visitor):

        # if we've reached the end of the recursion, line_metadata has one value per
        # combinatorial line metadata type. Now drill down into assays if needed.
        if not unvisited_meta_pks:
            self._visit_new_lines_and_assays(line_metadata, visitor)
            return

        unvisited_meta_pks = copy.copy(unvisited_meta_pks)  # only outer loop visitation counts!
        meta_pk = unvisited_meta_pks.pop()
        combinatorial_values = self.combinatorial_line_metadata[meta_pk]

        for value in combinatorial_values:
            line_metadata[meta_pk] = value
            self._visit_new_lines_helper(line_metadata, unvisited_meta_pks, visitor)

    def _visit_new_lines_and_assays(self, line_metadata_dict, visitor):
        if self.replicate_count == 0:
            self.importer.add_error(BAD_GENERIC_INPUT_CATEGORY, ZERO_REPLICATES)

        for replicate_num in range(1, self.replicate_count + 1):
            line_name = self.naming_strategy.get_line_name(line_metadata_dict, replicate_num)
            line = visitor.visit_line(
                line_name,
                self.description,
                line_metadata_dict,
                replicate_num
            )
            for protocol_pk in self.unique_protocols:
                # get common assay metadata for this protocol
                assay_metadata = copy.copy(self.protocol_to_assay_metadata[protocol_pk])

                ###############################################################################
                # loop over combinatorial assay creation metadata
                ###############################################################################
                # (most likely time as in experiment description files)
                combo = self.protocol_to_combinatorial_metadata_dict[protocol_pk]
                visited_pks = set()
                # outer loop for combinatorial
                for metadata_pk, values in viewitems(combo):
                    visited_pks.add(metadata_pk)
                    for value in values:
                        assay_metadata[metadata_pk] = value
                        # inner loop for combinatorial
                        for k, v in viewitems(combo):
                            if k in visited_pks:
                                continue
                            for value in v:
                                assay_metadata[k] = value
                                assay_name = self.naming_strategy.get_assay_name(
                                    line,
                                    protocol_pk,
                                    assay_metadata,
                                )
                                visitor.visit_assay(
                                    protocol_pk,
                                    line,
                                    assay_name,
                                    assay_metadata
                                )
                        # if only one item in combinatorial, inner loop never visits;
                        # do it here
                        if len(combo) == 1:
                            assay_name = self.naming_strategy.get_assay_name(
                                line,
                                protocol_pk,
                                assay_metadata,
                            )
                            visitor.visit_assay(protocol_pk, line, assay_name, assay_metadata)
                # if nothing in combinatorial, loops never get to visit; do it here
                if not combo:
                    assay_name = self.naming_strategy.get_assay_name(line, protocol_pk,
                                                                     assay_metadata,)
                    visitor.visit_assay(protocol_pk, line, assay_name, assay_metadata)


class CombinatorialCreationPerformance(object):
    def __init__(self):
        self.start_time = utcnow()
        zero_time_delta = self.start_time - self.start_time
        self.end_time = None
        self.context_queries_delta = zero_time_delta
        self.input_parse_delta = zero_time_delta
        self.ice_search_delta = zero_time_delta
        self.naming_check_delta = zero_time_delta
        self.edd_strain_search_delta = zero_time_delta
        self.edd_strain_creation_delta = zero_time_delta
        self.study_populate_delta = zero_time_delta
        self.total_time_delta = zero_time_delta

        self._subsection_start_time = self.start_time

    def reset(self, reset_context_queries=False):
        self.start_time = utcnow()
        zero_time_delta = self.start_time - self.start_time
        self.end_time = None
        if reset_context_queries:
            self.context_queries_delta = zero_time_delta
        self.input_parse_delta = zero_time_delta
        self.ice_search_delta = zero_time_delta
        self.naming_check_delta = zero_time_delta
        self.edd_strain_search_delta = zero_time_delta
        self.edd_strain_creation_delta = zero_time_delta
        self.study_populate_delta = zero_time_delta
        self.total_time_delta = zero_time_delta

    def end_context_queries(self):
        now = utcnow()
        self.context_queries_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with context queries in %0.3f seconds' %
                    self.context_queries_delta.total_seconds())

    def end_input_parse(self):
        now = utcnow()
        self.input_parse_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with input parsing in %0.3f seconds' %
                    self.input_parse_delta.total_seconds())

    def end_ice_search(self, found_count, total_count):
        now = utcnow()
        self.ice_search_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with ICE search. Found %(found_count)d of %(total_count)d entries in '
                    '%(seconds)0.3f seconds' % {
                        'found_count': found_count,
                        'total_count': total_count,
                        'seconds': self.ice_search_delta.total_seconds(), })

    def end_edd_strain_search(self, search_strain_count, found_strain_count):
        now = utcnow()
        self.edd_strain_search_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with EDD search.  Found local cache for %(found_count)d of '
                    '%(search_count)d ICE strains in %(seconds)0.3f seconds' %
                    {
                        'found_count': found_strain_count,
                        'search_count': search_strain_count,
                        'seconds': self.edd_strain_search_delta.total_seconds(),
                    })

    def end_edd_strain_creation(self, strain_count):
        now = utcnow()
        self.edd_strain_creation_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with attempted EDD strain creation for %(strain_count)d strains in '
                    '%(seconds)0.3f seconds' % {
                        'strain_count': strain_count,
                        'seconds': self.edd_strain_creation_delta.total_seconds()})

    def end_naming_check(self):
        now = utcnow()
        self.naming_check_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with EDD naming check in %0.3f seconds' %
                    self.naming_check_delta.total_seconds())

    def overall_end(self):
        now = utcnow()
        self.total_time_delta = now - self.start_time
        self._subsection_start_time = None
        logger.info('Done with study population in %0.3f seconds' %
                    self.total_time_delta.total_seconds())


def find_existing_strains(parts_by_ice_id, importer):
    """
    Directly queries EDD's database for existing Strains that match the UUID in each ICE entry.
    To help with database curation, for unmatched strains, the database is also searched for
    existing strains with a similar URL or name before a strain is determined to be missing.

    This method is very similar to the one used in create_lines.py, but was different enough to
    experiment with some level of duplication here. The original method in create_lines.py from
    which this one is derived uses EDD's REST API to avoid having to have database credentials.

    :param edd: an authenticated EddApi instance
    :param parts_by_ice_id: a list of Ice Entry objects for which matching EDD Strains should
    be located
    :return: two collections; the first is a dict mapping ICE identifiers to existing EDD Strains,
    the second is a list of ICE strains not found to have EDD Strain entries
    """
    # TODO: following EDD-158, consider doing a bulk query here instead of tiptoeing around strain
    # curation issues

    # maps part number -> existing EDD strain (with part number temporarily cached)
    existing = OrderedDict()
    not_found = []

    if parts_by_ice_id:
        logger.info(f'Searching EDD for {len(parts_by_ice_id)} strains...')

    for ice_entry in viewvalues(parts_by_ice_id):
        # search for the strain by registry ID. Note we use search instead of .get() until the
        # database consistently contains/requires ICE UUID's and enforces uniqueness
        # constraints for them (EDD-158).
        found_strains_qs = Strain.objects.filter(registry_id=ice_entry.uuid)
        # if one or more strains are found with this UUID
        if found_strains_qs:
            if len(found_strains_qs) == 1:
                edd_strain = found_strains_qs.get()
                identifier = (ice_entry.part_id if importer.options.use_ice_part_numbers else
                              ice_entry.uuid)
                existing[identifier] = edd_strain
            else:
                importer.add_error(INTERNAL_EDD_ERROR_CATEGORY, NON_UNIQUE_STRAIN_UUIDS,
                                   ice_entry.uuid, '')
        # if no EDD strains were found with this UUID, look for candidate strains by URL.
        # Code from here forward is attempted workarounds for EDD-158
        else:
            logger.debug(
                "ICE entry %(part_id)s (pk=%(pk)d) couldn't be located in EDD's database by "
                "UUID. Searching by name and URL to help avoid strain curation problems." % {
                    'part_id': ice_entry.part_id,
                    'pk': ice_entry.id
                }
            )
            not_found.append(ice_entry)
            url_regex = r'.*/parts/%(id)s(?:/?)'
            # look for candidate strains by pk-based URL (if present: more static / reliable
            # than name)
            found_strains_qs = Strain.objects.filter(
                registry_url__iregex=url_regex % {'id': str(ice_entry.id)},
            )
            if found_strains_qs:
                importer.add_warning(INTERNAL_EDD_ERROR_CATEGORY, SUSPECTED_MATCH_STRAINS,
                                     _build_suspected_match_msg(ice_entry, found_strains_qs))
                continue
            # look for candidate strains by UUID-based URL
            found_strains_qs = Strain.objects.filter(
                registry_url__iregex=(url_regex % {'id': str(ice_entry.uuid)})
            )
            if found_strains_qs:
                importer.add_warning(
                        INTERNAL_EDD_ERROR_CATEGORY, SUSPECTED_MATCH_STRAINS,
                        _build_suspected_match_msg(ice_entry, found_strains_qs))
                continue
            # if no strains were found by URL, search by name
            empty_or_whitespace_regex = r'$\s*^'
            no_registry_id = (
                Q(registry_id__isnull=True) |
                Q(registry_id__regex=empty_or_whitespace_regex)
            )
            found_strains_qs = Strain.objects.filter(
                no_registry_id,
                name__icontains=ice_entry.name,
            )
            if found_strains_qs:
                importer.add_warning(INTERNAL_EDD_ERROR_CATEGORY, SUSPECTED_MATCH_STRAINS,
                                     _build_suspected_match_msg(ice_entry, found_strains_qs))
                continue
    return existing, not_found


def _build_suspected_match_msg(ice_entry, found_strains_qs):
    return '{%(ice_entry)s, suspected matches = (%(suspected_matches)s)}' % {
        'ice_entry': ice_entry,
        'suspected_matches': ', '.join(strain.pk for strain in found_strains_qs),
    }
