
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

	# The maximum number of lines to read before giving up on finding the header.
	max_header_line_count = 20

	def __init__(self):
		self.input_file = None     # The file that is being parsed
		self.samples = None        # The final data resulting from batch parsing
		self.header_block = None   # The file header
		self.table_header = None   # The table header
		self.table_divider = None  # The table divider, indicates column widths
		self.section_widths = None # List of all column widths
		self.column_headers = None # The label at the head of each column

		self.amount_column_header_index  = None
		self.compound_column_header_index = None

	def parse_hplc_file(self, input_file_path):
		"""Loads the file on the given path and parses textual HPLC data from it."""

		if not os.path.exists(input_file_path):
			raise IOError("Error: unable to locate file %s" % input_file_path)

		# TODO: Remove with and store file handle.
		with io.open(input_file_path, "r", encoding = 'utf-16') as input_file:
			self.input_file = input_file
			logger.debug("opened and is reading file %s" % input_file_path)

			self._parse_file_header()

			self._collect_table_header()
			logger.debug("collected table_header")

			self.section_widths = self.determine_section_widths()
			logger.debug("parsed column widths")

			self._extract_column_headers_from_multiline_text()
			logger.debug("collected the column_headers")
			logger.debug("now reading in the data")

			# Read in each line and contruct records
			previous_name = None
			previous_segments = [None for x in range(len(self.section_widths))]

			self.samples = {}
			while self._parse_sample():
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

	def _parse_file_header(self):

		# read in header block
		self.header_block = [ self.input_file.readline() ]

		# header_block_length = 0
		logger.debug("searching for header block")
		i = 0
		while not self.header_block[-1].startswith("-"):
			line = self.input_file.readline()

			self.header_block.append( line )

			if i >= HPLC_Parser.max_header_line_count:
				raise Error("unable to find header: unexpected length")
			elif line == '':
				raise Error("unable to find header: EOF encountered")
			i += 1

		logger.debug("parsing header block")

		# the title line is first, and unused
		# title_line = header_block[0]

		# TODO: retain usable form of header entries?
	def _collect_table_header(self):
		# collect table header, "Sample Name", etc.
		# cliping it off the end of the header block
		self.table_header = []
		self.table_divider = self.header_block[-1]
		r_index = -2
		line = self.header_block[r_index]
		while line != "" and not line.isspace():
			self.table_header.append(line)
			r_index -= 1
			line = self.header_block[r_index]
		self.table_header.reverse()

		# collect header data, currently not parsed
		# ( removes table header from header block )
		self.header_block = self.header_block[1:r_index]

	def determine_section_widths(self):
		# parse widths
		section_widths = [0]
		section_index = 0
		for c in self.table_divider.strip():
			if c == '-':
				section_widths[section_index] += 1
			else:
				section_widths.append(0)
				section_index += 1

		logger.debug("section widths: %s", section_widths)

		return section_widths

	def _extract_column_headers_from_multiline_text(self):

		# collect the multiline text
		self.column_headers = []
		for section_width in self.section_widths:
			self.column_headers.append('')
		for line in self.table_header:
			section_index = 0
			section_width_carryover = 0
			for section_width in self.section_widths:

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
				self.column_headers[section_index] += segment
				section_index += 1

		# clean up the column headers
		for i in range(len(self.column_headers)):
			self.column_headers[i] = self.column_headers[i].split()

		# each sample is indexed by sample name

		# each value is indexed by column header
		for column_header_index in range(len(self.column_headers)):
			header = u""
			for header_part in self.column_headers[column_header_index]:
				header += u" " + header_part
			if len(header) > 0:
				header = header[1:]
			self.column_headers[column_header_index] = header

			logger.debug("header: %s", header)

			if header.startswith('Amount'):
				# self.amount_column_header_index  = column_header_index
				self.amount_begin_position = sum(self.section_widths[:column_header_index])+len(self.section_widths[:column_header_index])
				self.amount_end_position   = self.section_widths[column_header_index] + self.amount_begin_position
				logger.debug("Amount Begin: %s    End %s", self.amount_begin_position, self.amount_end_position)
				# logger.debug("Amount section width: %s", self.section_widths[:column_header_index])
			elif header.startswith('Compound'):
				# self.compound_column_header_index = column_header_index
				self.compound_begin_position = sum(self.section_widths[:column_header_index])+len(self.section_widths[:column_header_index])
				self.compound_end_position   = self.section_widths[column_header_index] + self.compound_begin_position
				logger.debug("Compound Begin: %s    End %s", self.compound_begin_position, self.compound_end_position)
				# logger.debug("Compound section width: %s", self.section_widths[:column_header_index])

	def _parse_sample(self):
		"""Collects a single sample from the file and stores it in the samples data structure

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
			line_sample_name = line[:self.section_widths[0]].strip()
			# logger.debug("line_sample_name: %s",line_sample_name)

			if line_sample_name:
				if sample_name:
					# logger.debug("new record encountered, resetting file pointer")
					self.input_file.seek(file_pos)
					return True

				# ensure no collision with previous sample labels by adding a number
				if self.samples.has_key(line_sample_name):
					line_sample_name += u'-2'
					i = 3
					while self.samples.has_key(line_sample_name):
						last_dash_index = line_sample_name.rindex('-')
						line_sample_name = line_sample_name[:last_dash_index+1] + unicode(i)
						i += 1

				sample_name = line_sample_name
				logger.debug("sample_name: %s",sample_name)

			if not line_sample_name and not sample_name: 
					logger.error("entry with no sample name found, aborting")
					return False

			# collect the other data items - grab amounts & compounds

			amount_string = line[self.amount_begin_position:self.amount_end_position].strip()
			compound_string = line[self.compound_begin_position:self.compound_end_position].strip()

			# initilize the sample entry
			if not self.samples.has_key(sample_name):
				self.samples[sample_name] = []

			# Put the value into our data structure
			if amount_string != u'-' and compound_string != u'-':
				self.samples[sample_name].append( (compound_string,amount_string) )

			self.current_sample = self.samples[sample_name]
