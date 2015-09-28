# -*- coding: utf-8 -*-


#import data_excelreader as excel
#excel.process_spreadsheet()

from django.conf import settings
from models import EDDObject, MetadataType, MetadataGroup, User, Study, Line, Assay, Strain, Measurement, MeasurementValue, MeasurementType, MeasurementUnit, Protocol, CarbonSource
from django.core.exceptions import ObjectDoesNotExist
#
#

def map_datablocks(datablocks):
	"""Maps datablocks to the database schema, and then updates the database."""
	print("map_datablocks()")

	""" Make sure all the data associated with a read is collected together """
	wellplate_reads = {}
	for block in datablocks:
		wellplate_read  = block[0]
		block_type = block[1]
		data  = block[2]
		if not wellplate_reads.has_key(wellplate_read):
			wellplate_reads[wellplate_read] = []
		wellplate_reads[wellplate_read].append(block)

	""" Process the data for each read """
	for read in wellplate_reads.keys():
		datablock = wellplate_reads[read]
		_process_read(read, datablock)



""" *** *** *** Internals *** *** *** """

def _ensure_needed_infrastructure_available():
	print("_ensure_needed_infrastructure_available()")
	# TODO: Temporary injection code

	is_needed = False
	try:
		group = MetadataGroup.objects.get(group_name='Enzyme Characterization')
	except ObjectDoesNotExist:
		is_needed = True

	if not is_needed:
		print 'Enzyme Characterization types already inserted'
		return
	print 'injecting Enzyme Characterization types into the database'

	group = MetadataGroup()
	group.group_name='Enzyme Characterization'
	group.save()

	# Study_description = MetadataType()
	# Study_description.type_name = 'Study_description'
	# Study_description.input_size = 300
	# Study_description.for_context = 'L'
	# Study_description.group_id = group.id
	# Study_description.save()

	# Study_name = MetadataType()
	# Study_name.type_name = 'Study_name'
	# Study_name.input_size = 30
	# Study_name.for_context = 'L'
	# Study_name.group_id = group.id
	# Study_name.save()

	well_reaction_temperature = MetadataType()
	well_reaction_temperature.type_name = 'Well reaction temperature'
	well_reaction_temperature.input_size = 5
	well_reaction_temperature.postfix = u'°C'
	well_reaction_temperature.for_context = 'P'
	well_reaction_temperature.group_id = group.id
	well_reaction_temperature.save()

	machine_internal_temperature = MetadataType()
	machine_internal_temperature.type_name='Machine internal temperature'
	machine_internal_temperature.input_size = 5
	machine_internal_temperature.postfix = u'°C'
	machine_internal_temperature.for_context = 'P'
	machine_internal_temperature.group_id = group.id
	machine_internal_temperature.save()

	device_name = MetadataType()
	device_name.type_name = 'Device Name'
	device_name.input_size = 120
	device_name.for_context = 'P'
	device_name.group_id = group.id
	device_name.save()

	protocol = Protocol()
	protocol.name = 'Enzyme Characterization - Plate Reader'
	protocol.description = 'Using a plate reader to collect Enzyme Characterization data.'
	protocol.active = True
	# TODO: figure out a saner ownership process
	owner = User.objects.get(username='jeads')
	protocol.owned_by_id = owner.id
	protocol.save()

	measurement_unit = MeasurementUnit()
	measurement_unit.unit_name = 'relative'
	measurement_unit.display = False
	measurement_unit.type_group = 'm'
	measurement_unit.save()

	""" Also Measurement Types """

	fluorescence = MeasurementType()
	fluorescence.type_name = 'Fluorescence'
	fluorescence.short_name = 'fluor'
	fluorescence.type_group = 'm'
	fluorescence.save()

	absorbance = MeasurementType()
	absorbance.type_name = 'Absorbance'
	absorbance.short_name = 'absorb'
	absorbance.type_group = 'm'
	absorbance.save()


def _collect_metadata_object_for_key(read_label, metadata_entries, key, Model_Class):
	print("_collect_metadata_object_for_key() - %s" % str(Model_Class))
	model = None
	if metadata_entries.has_key(key):
		#TODO: handle multi case
		try:
			if key == 'measurement_type':
				model = Model_Class.objects.get(type_name=metadata_entries[key])				
			elif key == 'measurement_unit':
				model = Model_Class.objects.get(unit_name=metadata_entries[key])				
			elif key == 'well_reaction_temperature':
				model.meta_store[key] = metadata_entries[key]
			# elif key == '':
			# elif key == '':
			else: # edd_object
				model = Model_Class.objects.get(name=metadata_entries[key])
		except ObjectDoesNotExist:
			raise Exception("The \"%s\" referenced by \"%s\" is not known to the database" % (key, read_label))
	return model

# TODO: complexity analysis
def _update_line_metastore(read_label, index, row, column, line, metadatablocks, known_enzymes):
	print("_update_line_metastore()")
	""" Update the metastore of a line """
	# TODO: CONSIDER: OPTIMIZE: Break into seperate loops, guarded by ifs
	for block in metadatablocks:
		label = block[1]
		value = block[2][index]
		# print( "block %s" % str(block) )
		if label == 'Enzyme':
			if value not in known_enzymes:
				raise Exception("Unspecified Enzyme type \"%s\" from read \"%s\"" % (value,read_label))
			else:
				line.save()
				line.strains.add(known_enzymes[value])
		elif label == 'carbon_source':
			try:
				carbon_source = CarbonSource.objects.get(name=value)
				line.save()
				line.carbon_source.add(carbon_source)
			except ObjectDoesNotExist:
				raise Exception("Error: Carbon source not found in database")
		# elif label == ''
		else:
			pass
			# print(value)
			# raise Exception("Unknown metadata block type \"%s\" found in read \"%s\"" % (label,read_label))


def _update_assay_metastore(read_label, index, row, column, assay, metadatablocks):
	print("_update_assay_metastore()")
	""" Update the metastore of an assay """
	for block in metadatablocks:
		label = block[1]
		value = block[2][index]
		# print( "block %s" % str(block) )

		if label == 'well_temperature':
			try:
				model = MetadataType.objects.get(type_name='Well reaction temperature')
				# print("** ** ** : " + unicode(value))
				assay.meta_store[unicode(model.id)] = unicode(value)
				# assay.meta_store[u'Well reaction temperature'] = unicode(value)
			except ObjectDoesNotExist:
				raise Exception("Error: Well temperature type not found in database")
		else:
			pass
			# raise Exception("Unknown metadata block type \"%s\" found in read \"%s\"" % (label,read_label))


#TODO: rename 'Study_*' in spreadsheet to something non-conflicting, like 'Grid_*'
#TODO: add associated study to spreadsheet and logic.

def _process_read(read_label, raw_datablocks):
	_ensure_needed_infrastructure_available()
	print("_process_read()")

	datablock = None
	metadata_entries = {}
	metadatablocks = []

	""" Categorize each type of datablock """
	print "categorizing datablocks"
	for block in raw_datablocks:
		label = block[1]
		data  = block[2]
		is_control = False

		if label == 'Data':
			"""Read in a 96 well grid of some measurements"""
			datablock = block
		elif label == 'ControlData':
			#TODO: Add in example
			datablock = block
			is_control = True
		elif label == 'Metadata':
			"""Read in a dictionary of metadata items"""
			metadata_entries.update(data)
		else:
			"""Read in a 96 well grid of some metadata item"""
			metadatablocks.append(block)



	""" Get the user identity """
	print 'getting user'
	if not metadata_entries['experimenter_ID']:
		raise Exception("An experimenter_ID that matches your EDD username is required to submit a sheet.")
	experimenter = User.objects.get(username=metadata_entries['experimenter_ID'])
	if not isinstance(experimenter, User):
		raise Exception("User id \"%s\" was not found, or did not return unique results." % metadata_entries['experimenter_ID'])
	if metadata_entries['experimenter_email']:
		if experimenter.email and experimenter.email.upper() != metadata_entries['experimenter_email'].upper():
			raise Exception("User email \"%s\" did not match the email in the database." % metadata_entries['experimenter_email'])
		else:
			experimenter.email = metadata_entries['experimenter_email']



	""" Generate or collect Study """

	if not metadata_entries.has_key('Study_name'):
		raise Exception("Study_name must be given!")

	study_name = metadata_entries['Study_name']
	study = None
	try:
		study = Study.objects.get(name=study_name)
		if study.contact_id != experimenter.id:
			raise Exception("The existing study \"%s\" is not associated with the experimenter \"%s\"" % (study_name,experimenter.username))
	except ObjectDoesNotExist:
		study = Study()
		study.contact = experimenter
		study.name = study_name
	if metadata_entries['extra_contact_information']:
		study.contact_extra = metadata_entries['extra_contact_information']
		pass
		# TODO: warning, replacing description

	if metadata_entries.has_key('Study_description'):
		study.study_description = metadata_entries['Study_description']
		# pass
		# TODO: warning, replacing description

	# TODO: Expand exception text support better feedback to handle multiple reads (read_label)





	""" Add metadata to study hstore """
	# TODO: move some of these to Line after disambiguation
	print 'study hstore population'

	if  metadata_entries.has_key('machine_internal_temperature_unit'):
		try:
			if MetadataType.objects.get(type_name='Machine internal temperature').postfix != metadata_entries['machine_internal_temperature_unit']:
				raise Exception("Machine internal temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['machine_internal_temperature_unit'], MetadataType.objects.get(type_name='Machine internal temperature').postfix))
		except ObjectDoesNotExist:
			raise Exception("ERROR: 'Machine internal temperature' MetadataType not found in database.")
	if metadata_entries['machine_internal_temperature']:
		# study.meta_store['machine_internal_temperature'] = unicode(metadata_entries['machine_internal_temperature'])
		pass

	# TODO: CONSIDER: Migrate to Line
	if metadata_entries.has_key('device_name'):
		# study.meta_store['device_name'] = unicode(metadata_entries['device_name'])
		pass
	else:
		raise Exception("Device name not given!")

	try:
		reaction_temp_type = MetadataType.objects.get(type_name='Well reaction temperature')
		if metadata_entries.has_key('well_reaction_temperature_unit'):
			if reaction_temp_type.postfix != metadata_entries['well_reaction_temperature_unit']:
				raise Exception("Well reaction temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['well_reaction_temperature_unit'], reaction_temp_type.postfix))
	except ObjectDoesNotExist:
		raise Exception("ERROR: MetadataType 'Well reaction temperature' not found in database")

	try:
		shaking_speed = MetadataType.objects.get(type_name='Shaking speed')
		if metadata_entries.has_key('shaking_speed_unit'):
			if not metadata_entries['shaking_speed_unit'] == shaking_speed.postfix:
				raise Exception("Shaking speed given in unknown unit \"%s\"" % metadata_entries['shaking_speed_unit'])
		if metadata_entries.has_key('shaking_speed'):
			# study.meta_store['shaking_speed'] = unicode(metadata_entries['shaking_speed'])
			pass
		## Commented out. No shaking speed should not imply it was shaked at default speed, but that it might not have been shaked.
		# else:
		# 	study.meta_store['shaking_speed'] = MetadataType.objects.get(type_name='Shaking speed').default_value;
	except ObjectDoesNotExist:
		raise Exception("ERROR: MetadataType 'Shaking speed' not found in database")

	study.save()


	protocol = _collect_metadata_object_for_key(read_label, metadata_entries, 'protocol_name', Protocol)
	measurement_type = _collect_metadata_object_for_key(read_label, metadata_entries, 'measurement_type', MeasurementType)
	measurement_unit = _collect_metadata_object_for_key(read_label, metadata_entries, 'measurement_unit', MeasurementUnit)
	if not measurement_unit:
		raise Exception("measurement_unit not specified in read \"%s\"" % (read_label))

	# TODO: ALL ENZYES
	known_enzymes = {}
	for key in metadata_entries.keys():
		if key.startswith('Enzyme_'):
			print 'Adding \"%s\" to known_enzymes' % metadata_entries[key]
			strain = Strain.objects.get(registry_id=metadata_entries[key])
			if not strain:
				raise Exception("The PartID for Enzyme \"%s\" was not recognized in read \"%s\"" % (key,read_label))
			# TODO: deal with multi case
			known_enzymes[key]=strain

	""" Handle measurements and well specific metadata """
	print 'Handle measurements and well specific metadata'

	# for block in metadatablocks:
	# 	print
	# 	print(block)
	# return

	#TODO: add merging for existing lines
	x = 0
	while x < 96:
		column = str((x % 12) + 1)
		row = chr(int(x / 12) + ord('A'))

		#TODO: Assay and Line metastore

		line = Line()
		line.study_id = study.object_ref_id
		line.experimenter_id = experimenter.id
		line.contact_id = experimenter.id
		line.name = 'line %s%s from read %s' % (row,column,read_label)
		print(line.name)
		if is_control:
			line.control = True
		else:
			line.control = False
		_update_line_metastore(read_label, x, row, column, line, metadatablocks, known_enzymes)
		line.save()


		assay = Assay()
		assay.line_id = line.object_ref_id
		assay.name = 'assay %s%s from read %s' % (row,column,read_label)
		assay.experimenter_id = experimenter.id
		print(assay.name)
		if protocol:
			assay.protocol_id = protocol.object_ref_id
		_update_assay_metastore(read_label, x, row, column, assay, metadatablocks)	
		assay.save()


		measurement = Measurement()
		measurement.active = True
		# TODO: compartment can't support 96 well plate indexing with only 1 varchar
		# measurement.compartment = 
		# TODO: consider adding to sheet
		# measurement.measurement_format = 
		measurement.experimenter_id = experimenter.id
		measurement.measurement_type = measurement_type
		# measurement.update_red_id
		measurement.x_units_id = 1
		measurement.y_units_id = measurement_unit.id
		measurement.assay_id = assay.id
		measurement.save()

		# print("DBLOCK **** : " + str(datablock[2][x]))
		measurement_value = MeasurementValue()
		measurement_value.x = [0.0]
		measurement_value.y = [datablock[2][x]]
		measurement_value.measurement_id = measurement.id
		# measurement_value.updated_id
		measurement_value.save()


		x+=1
	print
	print 'done'

	# TODO: well specific metadata

	# TODO:
	## metadata_entries['Enzyme_XYZ']

if __name__ == "__main__":
	input_file_path = "input/example_with_one_plate.xlsx"
	from .data_excelreader import process_spreadsheet
	data_blocks = process_spreadsheet( input_file_path )
	print( data_blocks )
	print
	print
	map_datablocks( datablocks )
	print
	print
	print "Done"



