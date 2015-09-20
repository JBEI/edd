

#import data_excelreader as excel
#excel.process_spreadsheet()

from django.conf import settings
from models import EDDObject, MetadataType, Study, Line, Assay, Measurement, MeasurementValue, MeasurementUnit, Protocol

#

def map_datablocks(datablocks):
	"""Maps datablocks to the database schema, and then updates the database."""

	""" Make sure all the data associated with a read is collected together """
	wellplate_reads = {}
	for block in datablocks:
		wellplate_read  = block[0]
		block_type = block[1]
		data  = block[2]
		if not wellplate_reads.has_key(wellplate_read):
			wellplate_reads[wellplate_read] = []
		wellplate_reads[wellplate_read] += block

	""" Process the data for each read """
	for read in wellplate_reads.keys():
		datablock = wellplate_reads[read]
		_process_read(read, datablock)




""" *** *** *** Internals *** *** *** """

def _ensure_metadata_types_available():
	# TODO: Temporary injection code

	group = MetadataGroup.objects.get(group_name='Enzyme Characterization')
	if group:
		print 'enz char metadata already inserted'
		return

	group = MetadataGroup()
	group.group_name='Enzyme Characterization'
	group.save()

	Study_description = MetadataType()
	Study_description.type_name = 'Study_description'
	Study_description.input_size = 300
	Study_description.for_context = 'L'
	Study_description.group_id = group.id
	Study_description.save()

	Study_name = MetadataType()
	Study_name.type_name = 'Study_name'
	Study_name.input_size = 30
	Study_name.for_context = 'L'
	Study_name.group_id = group.id
	Study_name.save()

	well_reaction_temperature = MetadataType()
	well_reaction_temperature.type_name = 'well_reaction_temperature'
	well_reaction_temperature.input_size = 5
	well_reaction_temperature.postfix = u'°C'
	well_reaction_temperature.for_context = 'P'
	well_reaction_temperature.group_id = group.id
	well_reaction_temperature.save()

	machine_internal_temperature = MetadataType()
	machine_internal_temperature.type_name = 'machine_internal_temperature'
	machine_internal_temperature.input_size = 5
	machine_internal_temperature.postfix = u'°C'
	machine_internal_temperature.for_context = 'P'
	machine_internal_temperature.group_id = group.id
	machine_internal_temperature.save()

	device_name = MetadataType()
	device_name.type_name = 'device_name'
	device_name.input_size = 120
	device_name.for_context = 'P'
	device_name.group_id = group.id
	device_name.save()

def _collect_metadata_object_for_key(read_label, metadata_entries, key, Model_Class):
	model = None
	if metadata_entries.has_key(key):
		#TODO: handle multi case
		model = Database_Class.objects.get(name=metadata_entries[key])
		if not model:
			raise Exception("The %s referenced by \"%s\" is not known" % (key, read_label))
	return model

# TODO: complexity analysis
def _update_line_or_assay_metastore(read_label, index, row, column, model, Model_Class, metadatablocks, known_enzymes):
	""" Update the metastore of a line or assay """
	label = metadatablock[0]
	value = metadatablock[1][x]
	for metadatablock in metadatablocks:
		if label == 'well_temperature':
			model.meta_store[label] = value
		elif label == 'carbon_source':
			model.meta_store[label] = value
		elif label == 'Enzyme':
			if type(Model_Class) != type(Line):
				continue
			elif value not in known_enzymes:
				raise Exception("Unspecified Enzyme type \"%s\" in read \"%s\"" % (value,read_label)
			else:
				model.strains.add(known_enzymes[value])
				#TODO: does the strain_id need to be added?
		else:
			raise Exception("Unknown metadata block type \"%s\" found in read \"%s\"" % (label,read_label))


#TODO: rename 'Study_*' in spreadsheet to something non-conflicting, like 'Grid_*'
#TODO: add associated study to spreadsheet and logic.

def _process_read(read_label, raw_datablocks):
	_ensure_metadata_types_available()

	datablock = None
	metadata_entries = {}
	metadatablocks = []

	""" Categorize each type of datablock """
	for block in raw_datablocks:
		label = block[1]
		data  = block[2]
		is_control = False

		if label == 'Data':
			"""Read in a 96 well grid of some measurments"""
			datablock = block
		elif label == 'ControlData':
			#TODO: Add in example
			datablock = block
			is_control = True
		elif label == 'Metadata':
			"""Read in a dictionary of metadata items"""
			metadata_entries.update(block)
		else:
			"""Read in a 96 well grid of some metadata item"""
			metadatablocks += (label,data)



	""" Get the user identity """
	if not metadata_entries['experimenter_ID']:
		raise Exception("An experimenter_ID that matches your EDD username is required to submit a sheet.")
	experimenter = User.objects.get(username=metadata_entries['experimenter_ID'])
	if not isinstance(experimenter, User):
		raise Exception("User id \"%s\" was not found, or did not return unique results." % metadata_entries['experimenter_ID'])
	if metadata_entries['experimenter_email']:
		if experimenter.email != metadata_entries['experimenter_email']:
			raise Exception("User email \"%s\" did not match the email in the database." % metadata_entries['experimenter_email'])



	""" Generate or collect Study """

	if not metadata_entries.has_key('Study_name'):
		raise Exception("Study_name must be given!")

	study_name = metadata_entries['Study_name']
	study = Study.objects.get(name==study_name)
	if not study:
		study = Study()
		study.contact = experimenter.id
	elif study.contact_id != experimenter.id:
		raise Exception("The existing study \"%s\" is not associated with the experimenter \"%s\"" % (study_name,experimenter.username))
	if metadata_entries['extra_contact_information']:
		study.contact_extra = metadata_entries['extra_contact_information']
		# TODO: warning, replacing description

	if metadata_entries.has_key('Study_description'):
		study.study_description = metadata_entries['Study_description']
		# TODO: warning, replacing description

	# TODO: Expand exception text support better feedback to handle multiple reads (read_label)





	""" Add metadata to study hstore """
	# TODO: move some of these to Line after disambiguation

	if  metadata_entries['machine_internal_temperature_unit']:
		if MetadataType.objects.get(type_name='Machine internal temperature').postfix != metadata_entries['machine_internal_temperature_unit']:
			raise Exception("Machine internal temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['machine_internal_temperature_unit'], MetadataType.objects.get(type_name='Machine internal temperature').postfix))
	if metadata_entries['machine_internal_temperature']:
		study.meta_store['machine_internal_temperature'] = metadata_entries['machine_internal_temperature']

	if metadata_entries['device_name']:
		study.meta_store['device_name'] = metadata_entries['device_name']
	else:
		raise Exception("Device name not given!")

	if  metadata_entries['well_reaction_temperature_unit']:
		if MetadataType.objects.get(type_name='Well reaction temperature').postfix != metadata_entries['well_reaction_temperature_unit']:
			raise Exception("Well reaction temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['well_reaction_temperature_unit'], MetadataType.objects.get(type_name='Well reaction temperature').postfix))	

	if MetadataType.objects.get(type_name='Reaction temperature').postfix != metadata_entries['well_reaction_temperature_unit']:
		raise Exception("Reaction temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['shaking_speed_unit'], MetadataType.objects.get(type_name='Reaction temperature').postfix))

	if not metadata_entries['shaking_speed_unit'] == MetadataType.objects.get(type_name='Shaking speed').postfix:
		raise Exception("Shaking speed given in unknown unit \"%s\"" % metadata_entries['shaking_speed_unit'])
	if metadata_entries['shaking_speed']:
		study.meta_store['shaking_speed'] = metadata_entries['shaking_speed']
	else:
		study.meta_store['shaking_speed'] = MetadataType.objects.get(type_name='Shaking speed').default_value;

	study.save()


	protocol = _collect_metadata_object_for_key(read_label, metadata_entries, 'protocol_name', Protocol)
	measurement_type = _collect_metadata_object_for_key(read_label, metadata_entries, 'measurement_type_ID', MeasurementType)
	measurement_unit = _collect_metadata_object_for_key(read_label, metadata_entries, 'measurement_unit', MeasurementUnit)
	if not measurement_unit:
		raise Exception("measurement_unit not specified in read \"%s\"" % (read_label))

	# TODO: ALL ENZYES
	known_enzymes = {}
	for key in metadata_entries.keys():
		if key.startswith('Enzyme_'):
			strain = Strain.objects.get(registry_id=metadata_entries[key])
			if not strain:
				raise Exception("The PartID for Enzyme \"%s\" was not recognized in read \"%s\"" % (key,read_label))
			# TODO: deal with multi case
			known_enzymes[key]=strain

	# TODO: carbon_source

	""" Handle measurments and well specific metadata """
	x = 0
	while x < 96:
		column = str((x % 12) + 1)
		row = chr(int(x / 12) + ord('A'))

		#TODO: Assay and Line metastore

		line = Line()
		line.study_id = study.object_ref_id
		line.experimenter_id = experimenter.id
		line.contact_id = experimenter.id
		line.name = 'line %s%s in Study %i: %s' % (row,column,study.object_ref_id,study.name)
		if is_control:
			line.control = True
		else
			line.control = False
		_update_line_or_assay_metastore(read_label, x, row, column, line, Line, metadatablocks, known_enzymes):
		line.save()


		assay = Assay()
		assay.line_id = line.object_ref_id
		assay.name = 'assay %s%s in Study %i: %s' % (row,column,study.object_ref_id,study.name)
		if protocol:
			assay.protocol_id = protocol.object_ref_id
		_update_line_or_assay_metastore(read_label, x, row, column, assay, Assay, metadatablocks, known_enzymes):
		assay.save()


		measurement = Measurement()
		measurement.active = True
		# TODO: compartment can't support 96 well plate indexing with only 1 varchar
		# measurement.compartment = 
		# TODO: consider adding to sheet
		# measurement.measurement_format = 
		measurment.experimenter_id = experimenter.id
		measurement.measurement_type_ID !!
		# measurement.update_red_id
		measurement.x_units_id = None
		measurement.y_units_id = measurement_unit
		measurement.assay_id = assay.id
		measurement.save()


		measurement_value = MeasurementValue()
		measurement_value.x = 0
		measurement_value.y = datablock[x]
		measurement_value.measurement_id = measurement.id
		# measurement_value.updated_id
		measurement_value.save()


		x+=1

	# TODO: well specific metadata

	# TODO:
	## metadata_entries['Enzyme_XYZ']



