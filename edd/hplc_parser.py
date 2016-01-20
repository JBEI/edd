#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for parsing the output of HPLC machines.
##
import sys, os, io, logging


logger = logging.getLogger(__name__)

# The maximum number of lines to read before giving up on finding the header.
max_header_line_count = 20

def parse_hplc_file(input_file_path):
	"""Loads the file on the given path and parses textual HPLC data from it."""

	if not os.path.exists(input_file_path):
		raise IOError("Error: unable to locate file %s" % input_file_path)

	with io.open(input_file_path, "r", encoding = 'utf-16') as input_file:
		return _parse_hplc_file_contents(input_file)

# debugging aid.
def _display_sample(samples,selection):
	q = {}
	for x in samples.keys():
		q[x] = {}
		for y in samples[x].keys():
			val = samples[x][y]
			if type(samples[x][y]) is list:
				val = val[:5]
			q[x][y] = val
	for v in q[q.keys()[selection]].keys():
		print v, q[q.keys()[selection]][v]

# Parses out the file
def _parse_hplc_file_contents(input_file):
	"""Collects records from the given file and returns them as a list"""
	logger.debug("opened and is reading file %s" % input_file_path)

	# read in header block
	header_block = [ input_file.readline() ]
	# header_block_length = 0
	logger.debug("searching for header block")
	i = 0
	while not header_block[-1].startswith("-"):
		line = input_file.readline()

		header_block.append( line )

		if i >= max_header_line_count:
			logger.error("unable to find header: unexpected length")
			exit(1)
		elif line == '':
			logger.error("unable to find header: EOF encountered")

		i += 1

	logger.debug("parsing header block")

	# the title line is first, and unused
	# title_line = header_block[0]

	# TODO: retain usable form of header entries?
	
	# collect table header, "Sample Name", etc.
	# cliping it off the end of the header block
	table_header = []
	table_divider = header_block[-1] 
	r_index = -2
	line = header_block[r_index]
	while line != "" and not line.isspace():
		table_header.append(line)
		r_index -= 1
		line = header_block[r_index]
	table_header.reverse()

	logger.debug("collected table_header")

	# collect header data, currently not parsed
	header_block = header_block[1:r_index]

	# parse widths
	section_widths = [0]
	section_index = 0
	for c in table_divider.strip():
		if c == '-':
			section_widths[section_index] += 1
		else:
			section_widths.append(0)
			section_index += 1

	logger.debug("parsed column widths")

	# parse table header
	# collect the multiline text
	column_headers = []
	for section_width in section_widths:
		column_headers.append('')
	for line in table_header:
		section_index = 0
		section_width_carryover = 0
		for section_width in section_widths:

			if not line or line.isspace():
				logger.debug('table header multiline scan terminated early')
				break

			# slice a segment off the line of the correct width
			width = section_width_carryover + section_width
			segment = line[:width]
			line = line[width:]

			# This is here because the normally empty divider space 
			# sometimes has an important character in it.
			#
			# clip divider character only if empty
			if len(line) > 0 and line[0].isspace():
				line = line[1:]
				section_width_carryover = 0
			else: # account for extra character in next section
				section_width_carryover = 1
			column_headers[section_index] += segment
			section_index += 1

	# clean up the column headers
	for i in range(len(column_headers)):
		column_headers[i] = column_headers[i].split()

	# prepare container that will collect the data
	# each sample is indexed by sample name
	samples = {}

	# each value is indexed by column header
	entry_template = {}
	for column_header_index in range(len(column_headers)):
		header = u""
		for header_part in column_headers[column_header_index]:
			header += u" " + header_part
		if len(header) > 0:
			header = header[1:]
		column_headers[column_header_index] = header
		entry_template[header] = []

	logger.debug("collected the column_headers")
	logger.debug("now reading in the data")

	previous_name = None
	while True:
		line = input_file.readline()
		if line == '\n':
			continue
		if not line:
			break

		# get the name of the sample related to the row
		sample_name = line[:section_widths[0]].strip()

		if sample_name:
			# ensure no collision with previous sample labels by adding a number
			if samples.has_key(sample_name):
				sample_name += u'-2'
				i = 3
				while samples.has_key(sample_name):
					last_dash_index = sample_name.rindex('-')
					sample_name = sample_name[:last_dash_index+1] + unicode(i)
					i += 1

			previous_name = sample_name
		if not sample_name:
			if not previous_name:
				logger.error("entry with no sample name found, aborting")
				return None
			sample_name = previous_name

		# initilize the sample entry
		if not samples.has_key(sample_name):
			samples[sample_name] = dict(entry_template)

		# collect the other data items
		for row_index in range(len(section_widths)):
			segment = line[:section_widths[row_index]].strip()
			line = line[section_widths[row_index]+1:]
			if segment:
				samples[sample_name][column_headers[row_index]].append(segment)

	logger.info("successfully parsed the HPLC file %s"
		% os.path.basename(input_file_path))

	return samples


if __name__ == "__main__":

	if len(sys.argv) is not 2:
		print("usage: python hplc_parser.py input_file_path")
		exit(1)

	log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

	logging.basicConfig(
		filename='hplc_parser.log',
		level=logging.DEBUG,
		format=log_format)

	# echo all debug statements to stdout
	formatter = logging.Formatter( log_format )
	sh = logging.StreamHandler(sys.stdout)
	sh.setLevel(logging.DEBUG)
	sh.setFormatter(formatter)
	logger.addHandler(sh)

	# parse the provided filepath
	input_file_path = sys.argv[1]
	samples = parse_hplc_file(input_file_path)

	# activate interactive debugger with our information inside
	import IPython
	IPython.embed(banner1="\n\nparse function returned, values stored in dict 'samples'")

