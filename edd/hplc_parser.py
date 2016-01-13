#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for parsing the output of HPLC machines.
##
import logging
import sys, os
import io


logger = logging.getLogger(__name__)

# header_prefix_width = 21
# header_expected_count = 6

max_header_line_count = 20

# Parses out the file
def parse_hplc_file(input_file_path):
	if not os.path.exists(input_file_path):
		raise IOError("Error: unable to locate file %s" % input_file_path)

	with io.open(input_file_path, "r", encoding = 'utf-16') as input_file:
		logger.debug("HPLC_parser opened and is reading file %s" % input_file_path)


		# read in header block
		header_block = [ input_file.readline() ]
		# header_block_length = 0
		logger.debug("HPLC_parser searching for header block")
		i = 0
		while not header_block[-1].strip().startswith("-"):
			line = input_file.readline()

			header_block.append( line.strip() )

			if i >= max_header_line_count:
				logger.error("HPLC_parser unable to find header: unexpected length")
				exit(1)
			elif line == '':
				logger.error("HPLC_parser unable to find header: EOF encountered")
				
			i += 1

		logger.debug("HPLC_parser parsing header block")

		# the title line is first, and unused
		# title_line = header_block[0]
		
		# collect table header, "Sample Name... "
		# clips it off the end of the header block

		table_header = []
		table_divider = header_block[-1] 
		r_index = -2
		line = header_block[r_index]
		while line != "" and not line.isspace():
			table_header.append(line)
			r_index -= 1
			line = header_block[r_index]
		table_header.reverse()

		logger.debug("HPLC_parser collected table_header")

		# collect header data, currently not parsed
		header_block = header_block[1:r_index]

		# parse widths
		section_widths = [0]
		section_index = 0
		for c in table_divider:
			if c == '-':
				section_widths[section_index] += 1
			else:
				section_widths.append([0])

		logger.debug("HPLC_parser parsed column widths")

		# parse table header
		# collect the multiline text
		column_headers = []
		for section_width in section_widths:
			column_headers.append('')
		section_index = 0
		for line in table_header:
			section_width_carryover = 0
			for section_width in section_widths:

				# slice a segment off the line of the correct width
				logger.debug(section_width_carryover)
				logger.debug(section_width)
				width = section_width_carryover + section_width
				segment = line[:width]
				line = line[width:]

				# clip divider charater only if empty
				if len(line) > 0 and line[0].isspace():
					line = line[1:]
					section_width_carryover = 0
				else: # account for extra character in next section
					section_width_carryover = 1
				column_headers[section_index] += segment

		# clean up the column headers
		for i in range(len(column_headers)):
			column_headers[i] = column_headers[i].split()

		# collect the data
		# each sample is indexed by sample name
		samples = {}
		line = input_file.readline()

		# each value is indexed by column header
		entry_template = {}
		for column_header in column_headers:
			entry_template[column_header] = []

		previous_name = None
		while line != '':
			if line == '\n':
				continue

			# get the name of the sample related to the row
			sample_name = line[section_widths[0]].strip()
			if not sample_name:
				sample_name = previous_name
			else:
				previous_name = sample_name

			# initilize the sample entry
			if not samples.has_key(sample_name):
				samples[sample_name] = dict(entry_template)

			# collect the other data items
			for row_index in range(section_widths)[1:]:
				segment = line[:section_widths[row_index]].strip()
				line = line[section_widths[row_index]:]
				samples[sample_name][column_headers[row_index]].append(segment)

			line = input_file.readline()

	return samples


if __name__ == "__main__":

	logging.basicConfig(filename='hplc_parser.log',level=logging.DEBUG)

	if len(sys.argv) is not 2:
		print("usage: python hplc_parser.py input_file_path")
		exit(1)

	logger.debug("\nHPLC_parser hello world")

	input_file_path = sys.argv[1]

	samples = parse_hplc_file(input_file_path)

	print( samples )


