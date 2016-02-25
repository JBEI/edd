
#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for parsing the output of HPLC machines.
##
import sys, os, io, logging

# TODO: Finish Restructure as an Interable Object, allowing samples or lines to 
# be processed individually rather then in one big batch. __next__()

class HPLC_Parser:
	logger = logging.getLogger(__name__)

	# The maximum number of lines to read before giving up on finding the header
	max_header_line_count = 20

	def __init__(self):
		self.input_file = None     # The file that is being parsed
		self.samples = None        # The final data resulting from batch parsing

		self.amount_column_header_index  = None
		self.compound_column_header_index = None

	def parse_hplc_file(self, input_file_path):
		"""Loads the file on the given path and parses textual HPLC data
		 from it."""

		if not os.path.exists(input_file_path):
			raise IOError("Error: unable to locate file %s" % input_file_path)

		# TODO: Remove with and store file handle.
		with io.open(input_file_path, "r", encoding = 'utf-16') as input_file:
			self.input_file = input_file
			logger.debug("opened and is reading file %s" % input_file_path)

			header_block = self._parse_file_header(self.input_file)

			(header_block,table_header,table_divider) \
			    = self._collect_table_header(header_block)
			logger.debug("collected table_header")

			section_widths = self.determine_section_widths(table_divider)
			logger.debug("parsed column widths")

			self._extract_column_headers_from_multiline_text( \
				section_widths, table_header)
			logger.debug("collected the column_headers")
			logger.debug("now reading in the data")

			# Read in each line and contruct records
			previous_name = None
			previous_segments = [None for x in range(len(section_widths))]

			self.samples = {}
			while self._parse_sample(section_widths):
				pass

			logger.info("successfully parsed the HPLC file %s" \
				% os.path.basename(input_file_path))
			return self.samples

	# debugging aid.
	def _display_sample(self, selection):
		q = {}
		for x in self.samples.keys():
			q[x] = {}
			for y in self.samples[x].keys():
				val = self.samples[x][y]
				if type(self.samples[x][y]) is list:
					val = val[:5]
				q[x][y] = val
		for v in q[q.keys()[selection]].keys():
			print v, q[q.keys()[selection]][v]

	def _parse_file_header(self, input_file):

		# read in header block
		header_block = [ input_file.readline() ]

		# header_block_length = 0
		logger.debug("searching for header block")
		i = 0
		while not header_block[-1].startswith("-"):
			line = input_file.readline()

			header_block.append( line )

			if i >= HPLC_Parser.max_header_line_count:
				raise Error("unable to find header: unexpected length")
			elif line == '':
				raise Error("unable to find header: EOF encountered")
			i += 1

		logger.debug("parsing header block")

		# the title line is first, and unused
		# title_line = header_block[0]

		# TODO: retain usable form of header entries?

		return header_block


	def _collect_table_header(self, header_block):
		# collect table header, "Sample Name", etc.
		# cliping it off the end of the header block
		table_header = []
		table_divider = header_block[-1] # indicates column widths
		r_index = -2
		line = header_block[r_index]
		while line != "" and not line.isspace():
			table_header.append(line)
			r_index -= 1
			line = header_block[r_index]
		table_header.reverse()

		# collect header data, currently not parsed
		# ( removes table header from header block )
		header_block = header_block[1:r_index]

		return header_block,table_header,table_divider

	def determine_section_widths(self, table_divider):
		# parse widths
		section_widths = [0]
		section_index = 0
		for c in table_divider.strip():
			if c == '-':
				section_widths[section_index] += 1
			else:
				section_widths.append(0)
				section_index += 1

		logger.debug("section widths: %s", section_widths)

		return section_widths

	def _extract_column_headers_from_multiline_text( \
		self, section_widths, table_header):

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

				# The normally empty divider space sometimes has an
				# important character in it.
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

		# each sample is indexed by sample name

		# each value is indexed by column header
		for column_header_index in range(len(column_headers)):
			header = u""
			for header_part in column_headers[column_header_index]:
				header += u" " + header_part
			if len(header) > 0:
				header = header[1:]
			column_headers[column_header_index] = header

			logger.debug("header: %s", header)

			if header.startswith('Amount'):
				self.amount_begin_position = sum( \
					section_widths[:column_header_index]) \
				    + len(section_widths[:column_header_index])
				self.amount_end_position = section_widths[column_header_index] \
				                           + self.amount_begin_position
				logger.debug("Amount Begin: %s    End %s", \
					self.amount_begin_position, self.amount_end_position)
				# logger.debug("Amount section width: %s", \
				#    section_widths[:column_header_index])
			elif header.startswith('Compound'):
				self.compound_begin_position = sum( \
					section_widths[:column_header_index]) \
				    + len(section_widths[:column_header_index])
				self.compound_end_position = \
				    section_widths[column_header_index] \
				    + self.compound_begin_position
				logger.debug("Compound Begin: %s    End %s", \
					self.compound_begin_position, self.compound_end_position)
				# logger.debug("Compound section width: %s", \
				#     section_widths[:column_header_index])

		return column_headers


	def _parse_96_well_format_samples(self):
		"""Collects the samples from a 96 well plate format file

		Format: [ (compound_string,amount_string), ...] """

		raise NotImplementedError("_parse_96_well_format_samples")

		# sample_names = []

		# # collect all the sample names
		# # ...

		# while False:
		# 	if line.startswith('#'):
		# 		# End of block.
		# 		pass


	def _parse_sample(self, section_widths):
		"""Collects a single sample from the file and stores it in
		the samples data structure

		Returns True when a sample was read successfully, else False

		Format: [ (compound_string,amount_string), ...] """

		## Collect Sample Name
		sample_name = None

		## Loop - collect each line associated with the sample
		while True:

			file_pos = self.input_file.tell()
			line = self.input_file.readline()
			if line == '\n': # Skip blank line
				continue
			if not line: # End Of File
				return False

			## verify a new sample has not started.

			# get the name of the sample related to the row
			line_sample_name = line[:section_widths[0]].strip()
			# logger.debug("line_sample_name: %s",line_sample_name)

			if line_sample_name:
				if sample_name:
					# new record encountered, resetting file pointer
					self.input_file.seek(file_pos)
					return True

				# ensure no collision with previous sample names by adding a #
				if self.samples.has_key(line_sample_name):
					line_sample_name += u'-2'
					i = 3
					while self.samples.has_key(line_sample_name):
						last_dash_index = line_sample_name.rindex('-')
						line_sample_name = \
						    line_sample_name[:last_dash_index+1] + unicode(i)
						i += 1

				sample_name = line_sample_name
				logger.debug("sample_name: %s",sample_name)

			if not line_sample_name and not sample_name: 
					logger.error("entry with no sample name found, aborting")
					return False

			# collect the other data items - grab amounts & compounds

			amount_string = line[ \
			    self.amount_begin_position : \
			    self.amount_end_position].strip()

			compound_string = line[ \
			    self.compound_begin_position : \
			    self.compound_end_position].strip()

			# initilize the sample entry
			if not self.samples.has_key(sample_name):
				self.samples[sample_name] = []

			# Put the value into our data structure
			if amount_string != u'-' and compound_string != u'-':
				self.samples[sample_name].append( \
					(compound_string,amount_string))
