# -*- coding: utf-8 -*-

import logging

from collections import defaultdict
from django.contrib.auth import get_user_model
from main.models import (
    CarbonSource, MeasurementType, MeasurementUnit, MetadataType, Protocol, Strain, Study,
    )


logger = logging.getLogger(__name__)


def map_datablocks(datablocks):
    """Maps datablocks to the database schema, and then updates the database."""
    logging.debug("map_datablocks()")

    # Make sure all the data associated with a read is collected together
    wellplate_reads = defaultdict(list)
    for block in datablocks:
        wellplate_read = block[0]
        wellplate_reads[wellplate_read].append(block)

    # Process the data for each read
    for read in wellplate_reads.keys():
        datablock = wellplate_reads[read]
        _process_read(read, datablock)


# *** *** *** Internals *** *** ***


def _collect_metadata_object_for_key(read_label, metadata_entries, key, Model_Class):
    logging.debug("_collect_metadata_object_for_key() - %s" % Model_Class)
    model = None
    if key in metadata_entries:
        # TODO: handle multi case
        try:
            if key == 'measurement_type':
                model = Model_Class.objects.get(type_name=metadata_entries[key])
            elif key == 'measurement_unit':
                model = Model_Class.objects.get(unit_name=metadata_entries[key])
            elif key == 'well_reaction_temperature':
                model.meta_store[key] = metadata_entries[key]
            else:  # edd_object
                model = Model_Class.objects.get(name=metadata_entries[key])
        except Model_Class.DoesNotExist:
            raise Exception("The \"%s\" referenced by \"%s\" is not known to the database" % (
                key, read_label))
    return model


# TODO: complexity analysis
def _update_line_metastore(read_label, index, row, column, line, metadatablocks, known_enzymes):
    """ Update the metastore of a line """
    logging.debug("_update_line_metastore()")
    # TODO: CONSIDER: OPTIMIZE: Break into seperate loops, guarded by ifs
    for block in metadatablocks:
        label = block[1]
        value = block[2][index]
        if label == 'Enzyme':
            if value not in known_enzymes:
                raise Exception("Unspecified Enzyme type \"%s\" from read \"%s\"" % (
                    value, read_label))
            else:
                line.save()
                line.strains.add(known_enzymes[value])
        elif label == 'carbon_source':
            try:
                carbon_source = CarbonSource.objects.get(name=value)
                line.save()
                line.carbon_source.add(carbon_source)
            except CarbonSource.DoesNotExist:
                raise Exception("Error: Carbon source not found in database")


def _update_assay_metastore(read_label, index, row, column, assay, metadatablocks):
    """ Update the metastore of an assay """
    logging.debug("_update_assay_metastore()")
    for block in metadatablocks:
        label = block[1]
        value = block[2][index]
        if label == 'well_temperature':
            try:
                model = MetadataType.objects.get(type_name='Well reaction temperature')
                assay.metadata_add(model, '%s' % value)
            except MetadataType.DoesNotExist:
                raise Exception("Error: Well temperature type not found in database")


# TODO: rename 'Study_*' in spreadsheet to something non-conflicting, like 'Grid_*'
# TODO: add associated study to spreadsheet and logic.

def _process_read(read_label, raw_datablocks):
    """ Categorize each type of datablock """
    logging.debug("_process_read()")
    datablock = None
    metadata_entries = {}
    metadatablocks = []
    logging.debug("categorizing datablocks")
    for block in raw_datablocks:
        label = block[1]
        data = block[2]
        is_control = False
        if label == 'Data':
            # Read in a 96 well grid of some measurements
            datablock = block
        elif label == 'ControlData':
            # TODO: Add in example
            datablock = block
            is_control = True
        elif label == 'Metadata':
            # Read in a dictionary of metadata items
            metadata_entries.update(data)
        else:
            # Read in a 96 well grid of some metadata item
            metadatablocks.append(block)

    # Get the user identity
    logging.debug('getting user')
    if not metadata_entries['experimenter_ID']:
        raise Exception("An experimenter_ID that matches your EDD username is required to submit "
                        "a sheet.")
    User = get_user_model()
    experimenter = User.objects.get(username=metadata_entries['experimenter_ID'])
    if not isinstance(experimenter, User):
        raise Exception("User id \"%s\" was not found, or did not return unique results." %
                        metadata_entries['experimenter_ID'])
    # NOTE: removed modification of User object (email); do not modify auth values from import code
    if (metadata_entries['experimenter_email'] and
            experimenter.email and
            experimenter.email.upper() != metadata_entries['experimenter_email'].upper()):
        raise Exception("User email \"%s\" did not match the email in the database." %
                        metadata_entries['experimenter_email'])

    # Generate or collect Study
    if 'Study_name' not in metadata_entries:
        raise Exception("Study_name must be given!")
    study_name = metadata_entries['Study_name']
    study = None
    try:
        study = Study.objects.get(name=study_name)
        if study.contact_id != experimenter.id:
            raise Exception("The existing study \"%s\" is not associated with the "
                            " experimenter \"%s\"" % (study_name, experimenter.username))
    except Study.DoesNotExist:
        study = Study(name=study_name, contact=experimenter)
    if metadata_entries.get('extra_contact_information', None):
        study.contact_extra = metadata_entries.get('extra_contact_information', None)
    if 'Study_description' in metadata_entries:
        study.study_description = metadata_entries['Study_description']
    # TODO: Expand exception text support better feedback to handle multiple reads (read_label)
    study.save()

    # Add metadata to study hstore
    # TODO: move some of these to Line after disambiguation
    # NOTE: all of these are line metadata, not study metadata
    logger.debug('study hstore population')
    if 'machine_internal_temperature_unit' in metadata_entries:
        try:
            temp = MetadataType.objects.get(type_name='Machine internal temperature')
            if temp.postfix != metadata_entries['machine_internal_temperature_unit']:
                raise Exception("Machine internal temperature given in unknown unit \"%s\", "
                                "expected unit \"%s\"" % (
                                    metadata_entries['machine_internal_temperature_unit'],
                                    temp.postfix))
        except MetadataType.DoesNotExist:
            raise Exception("ERROR: 'Machine internal temperature' MetadataType not found "
                            "in database.")
    if metadata_entries['machine_internal_temperature']:
        pass

    # TODO: CONSIDER: Migrate to Line
    if 'device_name' not in metadata_entries:
        raise Exception("Device name not given!")

    try:
        reaction_temp_type = MetadataType.objects.get(type_name='Well reaction temperature')
        if 'well_reaction_temperature_unit' in metadata_entries:
            if reaction_temp_type.postfix != metadata_entries['well_reaction_temperature_unit']:
                raise Exception("Well reaction temperature given in unknown unit \"%s\", "
                                "expected unit \"%s\"" % (
                                    metadata_entries['well_reaction_temperature_unit'],
                                    reaction_temp_type.postfix))
    except MetadataType.DoesNotExist:
        raise Exception("ERROR: MetadataType 'Well reaction temperature' not found in database")

    try:
        shaking_speed = MetadataType.objects.get(type_name='Shaking speed')
        if 'shaking_speed_unit' in metadata_entries:
            if not metadata_entries['shaking_speed_unit'] == shaking_speed.postfix:
                raise Exception("Shaking speed given in unknown unit \"%s\"" %
                                metadata_entries['shaking_speed_unit'])
        if 'shaking_speed' in metadata_entries:
            pass
    except MetadataType.DoesNotExist:
        raise Exception("ERROR: MetadataType 'Shaking speed' not found in database")

    protocol = _collect_metadata_object_for_key(
        read_label, metadata_entries, 'protocol_name', Protocol)
    measurement_type = _collect_metadata_object_for_key(
        read_label, metadata_entries, 'measurement_type', MeasurementType)
    measurement_unit = _collect_metadata_object_for_key(
        read_label, metadata_entries, 'measurement_unit', MeasurementUnit)
    if not measurement_unit:
        raise Exception("measurement_unit not specified in read \"%s\"" % (read_label))

    # TODO: ALL ENZYES
    known_enzymes = {}
    for key in metadata_entries.keys():
        if key.startswith('Enzyme_'):
            logger.debug('Adding \"%s\" to known_enzymes' % metadata_entries[key])
            strain = Strain.objects.get(registry_id=metadata_entries[key])
            if not strain:
                raise Exception("The PartID for Enzyme \"%s\" was not recognized in read \"%s\"" %
                                (key, read_label))
            # TODO: deal with multi case
            known_enzymes[key] = strain

    # Handle measurements and well specific metadata
    logger.debug('Handle measurements and well specific metadata')

    # TODO: add merging for existing lines
    x = 0
    while x < 96:
        column = str((x % 12) + 1)
        row = chr(int(x / 12) + ord('A'))

        # TODO: Assay and Line metastore
        line = study.line_set.create(
            name='line %s%s from read %s' % (row, column, read_label), control=is_control,
            experimenter=experimenter, contact=experimenter)
        logger.debug(line.name)
        _update_line_metastore(read_label, x, row, column, line, metadatablocks, known_enzymes)
        line.save()
        assay = line.assay_set.create(
            name='assay %s%s from read %s' % (row, column, read_label), experimenter=experimenter,
            protocol=protocol)
        logger.debug(assay.name)
        _update_assay_metastore(read_label, x, row, column, assay, metadatablocks)
        assay.save()
        measurement = assay.measurement_set.create(
            experimenter=experimenter, measurement_type=measurement_type, x_units_id=1,
            y_units=measurement_unit)
        measurement.measurementvalue_set.create(
            x=[0, ], y=[datablock[2][x], ])
        x += 1

# TODO: place former __main__ code in a test
