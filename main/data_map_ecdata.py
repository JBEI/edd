

#import data_excelreader as excel
#excel.process_spreadsheet()

from django.conf import settings
from models import EDDObject, MetadataType, Study, Line, Assay, Measurement, MeasurementValue

#

def map_datablocks(data_blocks):
	"""Maps datablocks to the database schema, and updates the database."""

	studies = {}
	for block in data_blocks:
		study = block[0]
		label = block[1]
		data  = block[2]
		if not studies.has_key(study):
			studies[study] = []
		studies[study] += block

	for study_blocks in studies:
		process_study(study_blocks)




""" *** *** *** Internals *** *** *** """

def _ensure_metadata_types_available():
	# TODO: Temporary injection code
	# TODO:

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


def _process_study(study_blocks):
	_ensure_metadata_types_available()

	data_block = None
	metadata_entries = {}
	metadata_blocks = []

	db_items_to_update = []

	for block in study_blocks:
		label = block[1]
		data  = block[2]

		if label == 'Data':
			"""Read in a 96 well grid of some measurments"""
			data_block = block
		elif label == 'Metadata':
			"""Read in a dictionary of metadata items"""
			metadata_entries.update(block)
		else:
			"""Read in a 96 well grid of some metadata item"""
			metadata_blocks += (label,data)

	# Get the needed hookups
	if not metadata_entries['experimenter_ID']:
		raise Exception("An experimenter_ID that matches your EDD username is required to submit a sheet.")
	experimenter = User.objects.get(username=metadata_entries['experimenter_ID'])
	if not isinstance(experimenter, User):
		raise Exception("User id \"%s\" was not found, or did not return unique results." % metadata_entries['experimenter_ID'])
	if metadata_entries['experimenter_email']:
		if experimenter.email != metadata_entries['experimenter_email']:
			raise Exception("User email \"%s\" did not match the email in the database." % metadata_entries['experimenter_email'])

	# generate study
	study = Study()
	db_items_to_update.append(study)
	study.contact = experimenter.id
	study.contact_extra = metadata_entries['extra_contact_information']

	#study_object = EDDObject.objects.get(id=study.object_ref_id)
	study_object = EDDObject()
	study.object_ref_id = study_object.id

	db_items_to_update.append(study_object)
	# TODO: allow merging into existing studies
	if  EDDObject.objects.get(name=metadata_entries['Study_name']:
		raise Exception("A study named \"%s\" already exists in the database." % metadata_entries['Study_name'])

	if 	metadata_entries['Study_name']:
		study_object.name = metadata_entries['Study_name']

	if metadata_entries['Study_description']:
		study_object.study_description = metadata_entries['Study_description']

	#TODO: Expand excption text support better feedback to handle multiple studies

	""" Add metadata to study hstore """

	if  metadata_entries['machine_internal_temperature_unit']:
		if MetadataType.objects.get(type_name='Machine internal temperature').postfix != metadata_entries['machine_internal_temperature_unit']:
			raise Exception("Machine internal temperature given in unknown unit \"%s\", expected unit \"%s\"" % (metadata_entries['machine_internal_temperature_unit'], MetadataType.objects.get(type_name='Machine internal temperature').postfix))
	if metadata_entries['machine_internal_temperature']:		
		study_object.meta_store['machine_internal_temperature'] = metadata_entries['machine_internal_temperature']

	if metadata_entries['device_name']:
		study_object.meta_store['device_name'] = metadata_entries['device_name']
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
		study_object.meta_store['shaking_speed'] = metadata_entries['shaking_speed']
	else:
		study_object.meta_store['shaking_speed'] = MetadataType.objects.get(type_name='Shaking speed').default_value;


	# TODO: carbon_source

	""" Handle measurments and well specific metadata """
	x = 0
	while x < 96:
		line = Line()
		assay = Assay()
		Measurement()
		MeasurementValue()

		x+=1




	# TODO: well specific metadata


	# TODO:
	#			# metadata_entries['experimenter_ID']
	#			# metadata_entries['experimenter_email']
	#			# metadata_entries['Study_description']
	#			# metadata_entries['Study_name']
	#			# metadata_entries['extra_contact_information']
	## metadata_entries['measurement_type_ID']
	## metadata_entries['measurement_unit']
	#			# metadata_entries['well_reaction_temperature_unit']
	#			# metadata_entries['machine_internal_temperature']
	#			# metadata_entries['machine_internal_temperature_unit']
	#			# metadata_entries['shaking_speed']
	#			# metadata_entries['shaking_speed_unit']
	## metadata_entries['Enzyme_XYZ']
	#			# metadata_entries['device_name']



