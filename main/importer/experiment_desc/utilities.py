# coding: utf-8
from __future__ import unicode_literals

import copy
import logging
from collections import defaultdict, OrderedDict, Sequence

from arrow import utcnow
from django.db.models import Q
from six import string_types

from main.models import Strain, MetadataType, Line, Assay
from .constants import (
    INVALID_ASSAY_META_PK,
    INVALID_AUTO_NAMING_INPUT,
    INVALID_LINE_META_PK,
    INVALID_PROTOCOL_META_PK,
    NON_UNIQUE_STRAIN_UUIDS, SUSPECTED_MATCH_STRAINS,
    UNMATCHED_PART_NUMBER, INTERNAL_EDD_ERROR_TITLE, ZERO_REPLICATES, BAD_GENERIC_INPUT_CATEGORY)


logger = logging.getLogger(__name__)

class NamingStrategy(object):
    """
    The abstract base class for different line/assay naming strategies. Provides a generic
    framework for use in different naming strategies used in template file upload and the eventual
    combinatorial line creation GUI (EDD-257).
    """
    def __init__(self):
        self.section_separator = '-'
        self.multivalue_separator = '_'
        self.space_replacement = '_'
        self.combinatorial_input = None
        self.fractional_time_digits = 0
        self.require_strains = False

    def get_line_name(self, line_strain_ids, line_metadata, replicate_num, line_metadata_types,
                      combinatorial_metadata_types, is_control, strains_by_pk):
        """
        :param strains_by_pk: 
        :raises ValueError if some required input isn't available for creating the name (either
            via this method or from other properties). Note that even if required for line name 
            uniqueness, strain names may be omitted.
        """
        raise NotImplementedError()  # require subclasses to implement

    def get_assay_name(self, line, protocol_pk, assay_metadata, assay_metadata_types):
        """
        :raises ValueError if some required input isn't available for creating the name (either
            via this method or from other properties)
        """
        raise NotImplementedError()  # require subclasses to implement

    def names_contain_strains(self):
        raise NotImplementedError()

    def _build_strains_names_list(self, line_strain_ids, strains_by_pk):
        """
        Computes the line name segment for strain names, if needed to make the line name unique
        :param line_strain_ids: 
        :param strains_by_pk: 
        :return: the line name segment for strain names, or an empty string if unneeded or if unable
        to compute
        """

        # avoid problems when ICE-related errors prevent some/all strains from being found
        if not strains_by_pk:
            return []

        strain_names = []
        for strain_pk in line_strain_ids:
            strain = strains_by_pk.get(strain_pk, None)

            # skip single strains that weren't found
            if not strain:
                continue

            strain_names.append(strain.name.replace(' ', self.space_replacement))
        return strain_names


class NewLineAndAssayVisitor(object):
    """
    A simple abstract Visitor class for use during actual or simulated Line and Assay creation.
    """

    def __init__(self, study_pk, replicate_count):
        self.study_pk = study_pk
        # maps line name -> protocol_pk -> [ Assay ]
        self.line_to_protocols_to_assays_list = defaultdict(lambda: defaultdict(list))
        self.replicate_count = replicate_count
        self.require_strains = False

    def visit_line(self, line_name, description, is_control, strain_ids, line_metadata_dict,
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
    A NewLineAndAssayVisitor that's responsible for creating new Lines and Assays during the
    combinatorial line/assay creation or template file upload process.
    """
    def __init__(self, study_pk, strains_by_pk, replicate_count):
        super(LineAndAssayCreationVisitor, self).__init__(study_pk, replicate_count)
        self.lines_created = []
        self.require_strains = True
        self.strains_by_pk = strains_by_pk
        self._first_replicate = None

    def visit_line(self, line_name, description, is_control, strain_ids, line_metadata_dict,
                   replicate_num):

        hstore_compliant_dict = {
            str(pk): str(value)
            for pk, value in line_metadata_dict.iteritems() if value
        }
        if isinstance(strain_ids, Sequence) and not isinstance(strain_ids, string_types):
            strains = [self.strains_by_pk[pk] for pk in strain_ids if pk in self.strains_by_pk]
        else:
            strains = [strain_ids]

        line = Line.objects.create(
            name=line_name,
            description=description,
            control=is_control,
            study_id=self.study_pk,
            meta_store=hstore_compliant_dict,
            replicate=self._first_replicate
        )
        line.save()
        line.strains.add(*strains)
        self.lines_created.append(line)

        if (replicate_num == 1) and (self.replicate_count > 1):
            self._first_replicate = None

        return line

    def visit_assay(self, protocol_pk, line, assay_name, assay_metadata_dict):
        protocol_to_assays_list = self.line_to_protocols_to_assays_list[line.name]
        assays_list = protocol_to_assays_list[protocol_pk]

        # make sure everything gets cast to str to comply with Postgres' hstore field
        hstore_compliant_dict = {
            str(pk): str(value)
            for pk, value in assay_metadata_dict.items() if value
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
    def __init__(self, study_pk, replicate_count):
        super(LineAndAssayNamingVisitor, self).__init__(study_pk, replicate_count)
        # same names as in self.line_to_protocols_to_assays_list, but having this allows us to
        # detect duplicates
        self.line_names = []
        self._first_replicate = None

    def visit_line(self, line_name, description, is_control, strain_ids, line_metadata_dict,
                   replicate_num):

        self.line_names.append(line_name)

        # cache the line name (it's a defaultdict, so this line has an effect)
        self.line_to_protocols_to_assays_list[line_name]

        # construct, but don't save, a Line instance as a simple way to pass around all the
        # resultant metadata (e.g. in case it's used later in assay naming). These few lines
        # should be the only duplicated code for computing names vs. actually creating the
        # database objects.
        line = Line(
            name=line_name,
            description=description,
            control=is_control,
            study_id=self.study_pk,
            meta_store=line_metadata_dict,
            replicate=self._first_replicate
        )

        if (replicate_num == 1) and (self.replicate_count > 1):
            self._first_replicate = None

        return line

    def visit_assay(self, protocol_pk, line, assay_name, assay_metadata_dict):
        # cache the new assay names, along with associations to the related lines / protocols.
        # note that since Lines aren't actually created, we have to use names as a unique
        # identifier (a good assumption since we generally want / have coded the context here to
        # prevent duplicate line / assay naming via combinatorial creation tools.
        protocol_to_assay_names = self.line_to_protocols_to_assays_list[line.name]
        assay_names = protocol_to_assay_names[protocol_pk]
        assay_names.append(assay_name)


class AutomatedNamingStrategy(NamingStrategy):
    """
    An automated naming strategy for line/assay naming during combinatorial line/assay
    creation (but NOT template file upload, which uses _TemplateFileNamingStrategy).
    The user specifies the order of items in the line/assay names, then names are generated
    automatically.
    """

    STRAIN_NAME = 'strain_name'  # TODO: consider renaming to "part_id" to match use
    REPLICATE = 'replicate'
    # TODO: flesh out other items that are doubly-defined based on database field / metadata
    # conflicts --
    # CARBON_SOURCE = 'carbon_source'
    # EXPERIMENTER = 'experimenter'
    # CONTACT = 'contact'

    ELEMENTS = 'elements'
    CUSTOM_ADDITIONS = 'custom_additions'
    ABBREVIATIONS = 'abbreviations'

    def __init__(self, line_metadata_types_by_pk, assay_metadata_types_by_pk,
                 assay_time_metadata_type_pk, naming_elts=None, custom_additions=None,
                 abbreviations=None, ):
        super(AutomatedNamingStrategy, self).__init__()
        self.elements = naming_elts
        self.abbreviations = abbreviations
        self.line_metadata_types_by_pk = line_metadata_types_by_pk
        self.assay_metadata_types_by_pk = assay_metadata_types_by_pk
        self.assay_time_metadata_type_pk = assay_time_metadata_type_pk

        valid_items = [self.STRAIN_NAME, self.REPLICATE, ]
        valid_items.extend(pk for pk in self.line_metadata_types_by_pk.iterkeys())
        self._valid_items = valid_items

    def names_contain_strains(self):
        return self.STRAIN_NAME in self.elements

    @property
    def valid_items(self, valid_items):
        self._valid_items = valid_items
        self._used_valid_items = [False for x in range(len(valid_items))]

    @valid_items.getter
    def valid_items(self):
        return self._valid_items

    def verify_naming_elts(self, importer):
        # TODO: as a future usability improvement, check all abbreviations and verify that each
        # value has a match in the naming input and in the database (e.g. strain name)

        for value in self.elements:
            if value not in self._valid_items:
                importer.add_error(INTERNAL_EDD_ERROR_TITLE, INVALID_AUTO_NAMING_INPUT, value)

        if self.abbreviations:
            for abbreviated_element, replacements_dict in self.abbreviations.items():
                if abbreviated_element not in self.valid_items:
                    importer.add_error(INTERNAL_EDD_ERROR_TITLE, INVALID_AUTO_NAMING_INPUT,
                                       abbreviated_element, '')

    def get_line_name(self, line_strain_ids, line_metadata, replicate_num, line_metadata_types,
                      combinatorial_metadata_types, is_control, strains_by_pk):
        """
        Constructs a name for the specified line based on the order of naming elements explicitly
        specified by the client.
        """
        line_name = None
        for field_id in self.elements:
            append_value = ''
            if self.STRAIN_NAME == field_id:
                strain_names = []
                strain_names_list = self.build_strains_names_list(line_strain_ids, strains_by_pk)
                abbreviated_strains = [
                    self._get_abbrev(self.STRAIN_NAME, strain_name)
                    for strain_name in strain_names
                ]
                append_value = self.multivalue_separator.join(abbreviated_strains)

            elif self.REPLICATE == field_id:
                # NOTE: passing raw number causes a warning
                append_value = str(replicate_num)
            else:
                # raises ValueError if not found per docstring
                meta_value = line_metadata.get(field_id)
                if not meta_value:
                    raise ValueError('No value found for metadata field with id %s' % field_id)
                append_value = self._get_abbrev(field_id, meta_value)

            if not line_name:
                line_name = append_value
            else:
                line_name = self.separator.join((line_name, append_value))

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
        common_value = common_assay_metadata.get(self.assay_time_metadata_type_pk, None)
        if common_value:
            return []
        combinatorial_values = combinatorial_assay_metadata.get(
            self.assay_time_metadata_type_pk,
            None
        )
        if not combinatorial_values:
            return [self.assay_time_metadata_type_pk]

    def _get_abbrev(self, field_id, raw_value):
        """
        Gets the abbreviated value to use for this field/value combination, or
        returns raw_value if there's no corresponding abbreviation
        """
        values = self.abbreviations.get(field_id, None)
        if not values:
            return raw_value
        abbreviation = values.get(raw_value)
        if abbreviation:
            # tolerate values that may have been provided as ints, for example
            return str(abbreviation)
        return str(raw_value)

    def get_assay_name(self, line, protocol_pk, assay_metadata, assay_metadata_types):
        # TODO: reconsider assay configuration / naming in the GUI when implementing, then
        # update placeholder implementation here.  Pre-measurement assay creation wasn't under
        # discussion until after creating the combinatorial UI mockup attached to EDD-257
        logger.info('Assay metadata: %s' % assay_metadata)
        assay_time = assay_metadata.get(self.assay_time_metadata_type_pk, None)
        if not assay_time:
            raise ValueError('No time value was found -- unable to generate an assay name')
        return self.separator.join((line.name, '%sh' % str(assay_time)))

    def names_contain_strains(self):
        raise NotImplementedError()


class CombinatorialDescriptionInput(object):
    """
    Defines the set of inputs required to combinatorially create Lines and Assays for a Study.
    """

    def __init__(self, naming_strategy, description=None, is_control=[False],
                 combinatorial_strain_id_groups=[], replicate_count=1, common_line_metadata={},
                 combinatorial_line_metadata=defaultdict(list), protocol_to_assay_metadata={},
                 protocol_to_combinatorial_metadata={}):
        """
        :param naming_strategy: a NamingStrategy instance used to compute line/assay names from a
            combination of user input and information from the database (e.g. protocol names).
        :param description: an optional string to use as the description for all lines created.
        :param is_control: a sequence of boolean values used to combinatorially create lines/assays
        :param combinatorial_strain_id_groups: an optional sequence of identifiers for groups of
            strains to use in combinatorial line/assay creation.
        :param replicate_count: an integer number of replicate lines to create for each unique
            combination of line properties / metadata.
        :param common_line_metadata:
        :param combinatorial_line_metadata:
        :param protocol_to_assay_metadata:
        :param protocol_to_combinatorial_metadata:
        """

        # MULTIVALUED_LINE_METADATA_COLUMN_PKS = [
        #     MetadataType.objects.get(for_context=MetadataType.LINE, type_field='strains'),
        #     MetadataType.objects.get(for_context=MetadataType.LINE, type_field='carbon_source'),
        # ]

        # TODO: add support, parsing, DB code for combinatorial use of non-metadata CarbonSource?

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

        # keeping state in these values, want to copy instead of using references
        self.is_control = copy.copy(is_control)
        # sequences of ICE part ID's readable by users
        self.combinatorial_strain_id_groups = copy.copy(combinatorial_strain_id_groups)
        self.replicate_count = replicate_count
        self.common_line_metadata = copy.copy(common_line_metadata)
        # maps MetadataType pk -> []
        self.combinatorial_line_metadata = copy.copy(combinatorial_line_metadata)

        ###########################################################################################
        # protocol-specific metadata
        ###########################################################################################
        self.unique_protocols = set(protocol_to_assay_metadata.keys())
        self.unique_protocols.update(protocol_to_combinatorial_metadata.keys())

        # optional. maps protocol pk -> { MetadataType.pk -> [values] }
        self.protocol_to_assay_metadata = defaultdict(lambda: defaultdict(list))
        self.protocol_to_assay_metadata.update(protocol_to_assay_metadata)

        # maps protocol_pk -> assay metadata pk -> list of values
        self.protocol_to_combinatorial_metadata_dict = defaultdict(lambda: defaultdict(list))
        self.protocol_to_combinatorial_metadata_dict.update(protocol_to_combinatorial_metadata)

        ###########################################################################################
        # General database context (prevents helper methods with too many parameters)
        ###########################################################################################
        self._line_metadata_types = None
        self._assay_metadata_types = None
        self._strain_pk_to_strain = None

    @property
    def fractional_time_digits(self):
        return self.naming_strategy.fractional_time_digits

    @fractional_time_digits.setter
    def fractional_time_digits(self, count):
        self.naming_strategy.fractional_time_digits = count

    def replace_strain_part_numbers_with_pks(self, edd_strains_by_part_number, ice_parts_by_number,
                                             ignore_integer_values=False):
        """
        Replaces part-number-based strain entries with pk-based entries and converts any
        single-item strain groups into one-item lists for consistency. Also caches strain
        references for future use by this instance on the assumption that they are not going
        to change.
        """
        for group_index, part_number_list in enumerate(self.combinatorial_strain_id_groups):
            if not isinstance(part_number_list, Sequence):
                part_number_list = [part_number_list]
                self.combinatorial_strain_id_groups[group_index] = part_number_list

            for part_index, part_number in enumerate(part_number_list):
                if ignore_integer_values:
                    if isinstance(part_number, int):
                        continue
                strain = edd_strains_by_part_number.get(part_number, None)
                if strain:
                    part_number_list[part_index] = strain.pk

                # Do an efficient double-check for consistency with complex surrounding code:
                # if part number is present in input, but *was* found in ICE, this is a
                # coding/maintenance error in the surrounding code. Parts NOT found in ICE
                # should already have resulted in error/warning messages
                # during the preceding ICE queries, and we don't need to track two errors for
                # the same problem.
                elif part_number in ice_parts_by_number:
                    self.add_error(UNMATCHED_PART_NUMBER, part_number)

    def get_unique_strain_ids(self, unique_strain_ids):
        """
        Gets a list of unique strain identifiers for this CombinatorialDescriptionInput. Note that
        the type of identifier in use depends on client code.

        :return: a list of unique strain identifiers
        """
        unique_strain_ids = set(unique_strain_ids)
        for strain_id_group in self.combinatorial_strain_id_groups:
            if isinstance(strain_id_group, string_types):
                unique_strain_ids.add(strain_id_group)
            elif isinstance(strain_id_group, Sequence):
                unique_strain_ids.update(strain_id_group)
            else:
                unique_strain_ids.add(strain_id_group)
        return unique_strain_ids

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

    def verify_pks(self, line_metadata_types_by_pk, assay_metadata_types_by_pk,
                   protocols_by_pk, importer):
        """
        Examines all primary keys cached in this instance and compares them against reference
        dictionaries provided as input.  Any primary keys that don't match the expected values
        will cause an error message to be added to the importer parameter. Note that this
        checking is necessary prior to inserting primary key values into the database's "hstore"
        field, but it's possible for it to miss new primary keys inserted into the database or old
        ones removed since the cached values provided in the parameters were originally queried
        from the database.
        """

        if isinstance(self.naming_strategy, AutomatedNamingStrategy):
            self.naming_strategy.verify_naming_elts(importer)

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

        for protocol_pk, input_assay_metadata_dict in self.protocol_to_assay_metadata.iteritems():
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

        for protocol_pk, metadata_dict in self.protocol_to_combinatorial_metadata_dict.iteritems():
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
                importer.add_error(INTERNAL_EDD_ERROR_TITLE, err_key, id)

    def compute_line_and_assay_names(self, study, line_metadata_types=None,
                                     assay_metadata_types=None, strains_by_pk=None):
        """
        Computes all line and assay names that would be created by this
        CombinatorialDescriptionInput without acutally making any database modifications.
        :param study: the study
        :param line_metadata_types: a dictionary mapping pk -> MetadataType for Line metadata
        :param assay_metadata_types: a dictionary mapping pk -> MetadataType for Assay metadata
        :return: a LineAndAssayNamingVisitor that contains information on all pending Line and
        Assay names.
        """
        visitor = LineAndAssayNamingVisitor(study.pk, self.replicate_count)
        self._visit_study(study, visitor, line_metadata_types, assay_metadata_types,
                          strains_by_pk)
        return visitor

    def populate_study(self, study, line_metadata_types=None, assay_metadata_types=None,
                       strains_by_pk=None):
        """
        Creates objects in the database, or raises an Exception if an unexpected error occurs.
        Note that the basic assumption of this method is that regardless of the original input
        method, strain identifiers in this instance have been matched to local numeric primary keys
        and that all error checking has already been completed. This method strictly performs
        database I/O that's expected to succeed.
        """
        visitor = LineAndAssayCreationVisitor(study.pk, strains_by_pk, self.replicate_count)
        self._visit_study(study, visitor, line_metadata_types, assay_metadata_types, strains_by_pk)
        return visitor

    def _visit_study(self, study, visitor, line_metadata_types=None,
                     assay_metadata_types=None, strains_by_pk=None):

        ###########################################################################################
        # Cache database values provided by the client to avoid extra DB queries, or else query /
        #  cache them for subsequent use
        ###########################################################################################
        if not line_metadata_types:
            line_metadata_types = {
                meta_type.pk: meta_type
                for meta_type in MetadataType.objects.filter(for_context=MetadataType.LINE)
            }
        self._line_metadata_types = line_metadata_types

        if not assay_metadata_types:
            assay_metadata_types = {
                meta_type.pk: meta_type
                for meta_type in MetadataType.objects.filter(for_context=MetadataType.ASSAY)
            }
        self._assay_metadata_types = assay_metadata_types

        # pass cached database values to the naming strategy, if relevant.
        need_strains_for_naming = self.naming_strategy.names_contain_strains
        need_strains_for_creation = self.naming_strategy.names_contain_strains
        if need_strains_for_naming or need_strains_for_creation:
            if strains_by_pk is None:
                # determine unique strain pk's and query for the Strains in the database (assumes
                # we're using pk's at this point instead of part numbers)
                # TODO: improve consistency in this and other similar checks by pulling out
                # single-item elements into lists during the parsing step, then consistently
                # assuming they're lists in subsequent code
                unique_strain_ids = self.get_unique_strain_ids()
                strains_by_pk = {
                    strain.pk: strain
                    for strain in Strain.objects.filter(pk__in=unique_strain_ids)
                }

            if need_strains_for_naming:
                self.naming_strategy.strains_by_pk = strains_by_pk
            if need_strains_for_creation:
                visitor.strains_by_pk = strains_by_pk

        ###########################################################################################
        # Visit all lines and assays in the study
        ###########################################################################################
        try:
            for strain_id_group in self.combinatorial_strain_id_groups:
                self ._visit_new_lines(study, strain_id_group, strains_by_pk, line_metadata_types,
                                       visitor)
            if not self.combinatorial_strain_id_groups:
                self._visit_new_lines(study, [], strains_by_pk, line_metadata_types, visitor)

        ###########################################################################################
        # Clear out local caches of database info
        ###########################################################################################
        finally:
            self._line_metadata_types = None
            self._assay_metadata_types = None
            if need_strains_for_naming:
                self.naming_strategy.strains_by_pk = None

    def _visit_new_lines(self, study, line_strain_ids, strains_by_pk, line_metadata_dict, visitor):
            visited_pks = set()
            line_metadata = copy.copy(self.common_line_metadata)
            # outer loop for combinatorial
            for metadata_pk, values in self.combinatorial_line_metadata.items():
                visited_pks.add(metadata_pk)
                for value in values:
                    line_metadata[metadata_pk] = value
                    # inner loop for combinatorial
                    for k, v in self.combinatorial_line_metadata.items():
                        # skip current metadata if already set in outer loop
                        if k in visited_pks:
                            continue
                        for value in v:
                            line_metadata[k] = value
                            self._visit_new_lines_and_assays(
                                study,
                                strains_by_pk,
                                line_strain_ids,
                                line_metadata,
                                visitor
                            )
                    # if only one item in combinatorial, inner loop never visits; do it here
                    if len(self.combinatorial_line_metadata) == 1:
                        self._visit_new_lines_and_assays(study, strains_by_pk, line_strain_ids,
                                                         line_metadata, visitor)
            # if nothing in combinatorial, loops never get to visit; do it here
            if not self.combinatorial_line_metadata:
                line_metadata = self.common_line_metadata
                self._visit_new_lines_and_assays(study, strains_by_pk, line_strain_ids,
                                                 line_metadata, visitor)

    def _visit_new_lines_and_assays(self, study, strains_by_pk, line_strain_ids,
                                    line_metadata_dict, visitor):
        if self.replicate_count == 0:
            self.importer.add_error(BAD_GENERIC_INPUT_CATEGORY, ZERO_REPLICATES)
        for replicate_num in range(1, self.replicate_count + 1):
            control_variants = [self.is_control]
            if isinstance(self.is_control, Sequence):
                control_variants = self.is_control
            for is_control in control_variants:

                line_name = self.naming_strategy.get_line_name(line_strain_ids, line_metadata_dict,
                                                               replicate_num,
                                                               self._line_metadata_types,
                                                               self.combinatorial_line_metadata,
                                                               is_control,
                                                               strains_by_pk)
                line = visitor.visit_line(
                    line_name,
                    self.description,
                    is_control,
                    line_strain_ids,
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
                    for metadata_pk, values in combo.iteritems():
                        visited_pks.add(metadata_pk)
                        for value in values:
                            assay_metadata[metadata_pk] = value
                            # inner loop for combinatorial
                            for k, v in combo.iteritems():
                                if k in visited_pks:
                                    continue
                                for value in v:
                                    assay_metadata[k] = value
                                    assay_name = self.naming_strategy.get_assay_name(
                                        line,
                                        protocol_pk,
                                        assay_metadata,
                                        self._assay_metadata_types
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
                                    self._assay_metadata_types,
                                )
                                visitor.visit_assay(protocol_pk, line, assay_name, assay_metadata)
                    # if nothing in combinatorial, loops never get to visit; do it here
                    if not combo:
                        assay_name = self.naming_strategy.get_assay_name(
                            line,
                            protocol_pk,
                            assay_metadata,
                            self._assay_metadata_types
                        )
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
        logger.info('Done with ICE search for %(found_count)d of %(total_count)d entries in '
                    '%(seconds)0.3f seconds' % {
                        'found_count': found_count,
                        'total_count': total_count,
                        'seconds': self.ice_search_delta.total_seconds(), })

    def end_edd_strain_search(self, strain_count):
        now = utcnow()
        self.edd_strain_search_delta = now - self._subsection_start_time
        self._subsection_start_time = now
        logger.info('Done with EDD search for %(strain_count)d strains in %(seconds)0.3f seconds' %
                    {
                        'strain_count': strain_count,
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


def find_existing_strains(ice_parts_by_number, importer):
    """
    Directly queries EDD's database for existing Strains that match the UUID in each ICE entry.
    To help with database curation, for unmatched strains, the database is also searched for
    existing strains with a similar URL or name before a strain is determined to be missing.

    This method is very similar to the one used in create_lines.py, but was different enough to
    experiment with some level of duplication here. The original method in create_lines.py from
    which this one is derived uses EDD's REST API to avoid having to have database credentials.

    :param edd: an authenticated EddApi instance
    :param ice_parts_by_number: a list of Ice Entry objects for which matching EDD Strains should
    be located
    :return: two collections; the first is a dict mapping Part ID to EDD Strain, the second is a
        list of ICE strains not found to have EDD Strain entries
    """
    # TODO: following EDD-158, consider doing a bulk query here instead of tiptoeing around strain
    # curation issues

    # maps part number -> existing EDD strain (with part number temporarily cached)
    existing = OrderedDict()
    not_found = []

    for ice_entry in ice_parts_by_number.values():
        # search for the strain by registry ID. Note we use search instead of .get() until the
        # database consistently contains/requires ICE UUID's and enforces uniqueness
        # constraints for them (EDD-158).
        found_strains_qs = Strain.objects.filter(registry_id=ice_entry.uuid)
        # if one or more strains are found with this UUID
        if found_strains_qs:
            if len(found_strains_qs) == 1:
                edd_strain = found_strains_qs.get()
                existing[ice_entry.part_id] = edd_strain
            else:
                importer.add_error(INTERNAL_EDD_ERROR_TITLE, NON_UNIQUE_STRAIN_UUIDS,
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
                importer.add_warning(INTERNAL_EDD_ERROR_TITLE, SUSPECTED_MATCH_STRAINS,
                                     _build_suspected_match_msg(ice_entry, found_strains_qs))
                continue
            # look for candidate strains by UUID-based URL
            found_strains_qs = Strain.objects.filter(
                registry_url__iregex=(url_regex % {'id': str(ice_entry.uuid)})
            )
            if found_strains_qs:
                importer.add_warning(
                        INTERNAL_EDD_ERROR_TITLE, SUSPECTED_MATCH_STRAINS,
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
                importer.add_warning(INTERNAL_EDD_ERROR_TITLE, SUSPECTED_MATCH_STRAINS,
                                     _build_suspected_match_msg(ice_entry, found_strains_qs))
                continue
    return existing, not_found


def _build_suspected_match_msg(ice_entry, found_strains_qs):
    return '{%(ice_entry)s, suspected matches = (%(suspected_matches)s)}' % {
        'ice_entry': ice_entry,
        'suspected_matches': ', '.join(strain.pk for strain in found_strains_qs),
    }
