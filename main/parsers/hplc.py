
#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for parsing the output of HPLC machines.
##
import sys, os, io, logging
from collections import OrderedDict, namedtuple

# TODO: Finish Restructure as an Interable Object, allowing samples or lines to 
# be processed individually rather then in one big batch. __next__()

class HPLC_Parse_Exception(Exception):
	pass

class HPLC_Parser:
	logger = logging.getLogger(__name__)

	# The maximum number of lines to read before giving up on finding the header
	max_header_line_count = 20

	def __init__(self):
		self.input_stream = None       # The stream that is being parsed
		self.samples = OrderedDict()   # The final data resulting from batch parsing
		self.compound_entry = namedtuple( 'Compound Entry', ['Compound','Amount'] )

		# Integer indices for standard format parsing
		self.amount_begin_position = None
		self.amount_end_position = None
		self.compound_begin_position = None
		self.compound_end_position = None


	def parse_hplc_data(self, input_stream):
		"""Parses textual HPLC data from it.

		 returns samples = { 'Sample Name': [('Compound','Amount'),...], ... }
		 """

		 # TODO: use 'with' and 'yield'
		 # TODO: Add warnings if the 96 well columns don't line up
		 # TODO: HPLC_Parse_Exception for what line parsing failed on!

		if self._check_is_96_well_format(self.input_stream):
			logger.info("Detected 96 well format in HPLC file")
			self._parse_96_well_format_samples()
		else:
			logger.info("Detected standard format in HPLC file")
			header_block = self._parse_file_header(self.input_stream)

			logger.debug("collecting the table_header")
			(header_block,table_header,table_divider) = self._get_table_header(header_block)

			logger.debug("parsing column widths")
			section_widths = self._get_section_widths(table_divider)

			logger.debug("collecting the column_headers")
			column_headers = self._extract_column_headers_from_multiline_text(
				section_widths, table_header)
			
			# Read in each line and contruct records
			logger.debug("now reading in the data")
			while self._parse_sample(section_widths):
				pass

		logger.info("successfully parsed the HPLC file %s",
			os.path.basename(input_file_path))

		self.input_stream.close()

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

	def _check_is_96_well_format(self, input_file):
		"""Checks if the file is in 96 well plate format.

		Must be first to access the file! Does not advance pointer.

		returns True if 96 well plate format
		returns False if standard format"""

		file_pos = self.input_stream.tell()
		firstline = input_file.readline()
		self.input_stream.seek(file_pos)

		if firstline.startswith("Batch"):
			return True
		else:
			return False



	def _parse_file_header(self, input_file):

		# read in header block
		header_block = [ input_file.readline() ]
		if "*** End of Report ***" in header_block[0]:
			return header_block

		# header_block_length = 0
		logger.debug("searching for header block")
		i = 0
		while not header_block[-1].startswith("-"):
			line = input_file.readline()

			header_block.append( line )

			if "*** End of Report ***" in line:
				return header_block
			elif i >= HPLC_Parser.max_header_line_count:
				raise HPLC_Parse_Exception("unable to find header: unexpected length")
			elif line == '':
				raise HPLC_Parse_Exception("unable to find header: EOF encountered")
			i += 1

		logger.debug("parsing header block")

		# the title line is first, and unused
		# title_line = header_block[0]

		# TODO: retain usable form of header entries?

		return header_block


	def _get_table_header(self, header_block):
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

	def _get_section_widths(self, table_divider):
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

	def _extract_column_headers_from_multiline_text(
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
				self.amount_begin_position = ( sum(
					section_widths[:column_header_index])
				    + len(section_widths[:column_header_index]) )
				self.amount_end_position = ( section_widths[column_header_index]
				                           + self.amount_begin_position )
				logger.debug("Amount Begin: %s    End %s",
					self.amount_begin_position, self.amount_end_position)
				# logger.debug("Amount section width: %s",
				#    section_widths[:column_header_index])
			elif header.startswith('Compound'):
				self.compound_begin_position = ( sum(
					section_widths[:column_header_index])
				    + len(section_widths[:column_header_index]) )
				self.compound_end_position = (
				    section_widths[column_header_index]
				    + self.compound_begin_position )
				logger.debug("Compound Begin: %s    End %s",
					self.compound_begin_position, self.compound_end_position)
				# logger.debug("Compound section width: %s",
				#     section_widths[:column_header_index])

		return column_headers


	def _parse_96_well_format_block(
		self,sample_names, compounds, column_headers,section_widths):
		"""Reads in a single block of data from file"""

		end_of_block = False
		line_number = 0
		while not end_of_block:
			line = self.input_stream.readline()

			if line.startswith('#'):
				end_of_block = True

			for index in range(len(column_headers)):
				if "Sample" in column_headers[index]:
					begin_position = ( sum(  section_widths[:index] ) 
									+ len( section_widths[:index] ) )
					end_position = section_widths[index] + begin_position
					name = line[begin_position:end_position].strip()
					# sample names is implicitly indexed by line_number
					sample_names.append(name)
				elif "Amount" in column_headers[index]:
					begin_position = ( sum(  section_widths[:index] )
									+ len( section_widths[:index] ) )
					end_position = section_widths[index] + begin_position
					amount = line[begin_position:end_position].strip()

					if float(amount) == 0.0:
						continue

					compound = column_headers[index].replace("Amount","").strip()

					compounds.append((line_number,self.compound_entry(compound,amount)))

			line_number += 1

		return sample_names, compounds


	def _parse_96_well_format_samples(self):
		"""Collects the samples from a 96 well plate format file

		Format: [ (compound_string,amount_string), ...] """

		# raise NotImplementedError("_parse_96_well_format_samples")

		sample_names = []
		compounds = []

		# collect all the sample names
		# ...

		while True:
			logger.debug("collecting the header_block")
			header_block = self._parse_file_header(self.input_stream)

			if "*** End of Report ***" in header_block[-1]:
				break

			logger.debug("collecting the table_header")
			(header_block,table_header,table_divider)
			    = self._get_table_header(header_block)

			logger.debug("parsing column widths")
			section_widths = self._get_section_widths(table_divider)

			logger.debug("collecting the column_headers")
			column_headers = self._extract_column_headers_from_multiline_text(
				section_widths, table_header)

			self._parse_96_well_format_block(
				sample_names, compounds, column_headers, section_widths)

		# Line up the sample name with the amounts
		for indexed_compound in compounds:
			line_number, compound = indexed_compound
			sample_name = sample_names[line_number]
			if sample_name in self.samples:
				self.samples[sample_name].append(compound)
			else:
				self.samples[sample_name] = [compound]
			
	def _parse_sample(self, section_widths):
		"""Collects a single sample from the file and stores it in
		the samples data structure

		Returns True when a sample was read successfully, else False

		Format: [ (compound_string,amount_string), ...] """

		## Collect Sample Name
		sample_name = None

		## Loop - collect each line associated with the sample
		while True:

			file_pos = self.input_stream.tell()
			line = self.input_stream.readline()
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
					self.input_stream.seek(file_pos)
					return True

				# ensure no collision with previous sample names by adding a #
				if self.samples.has_key(line_sample_name):
					line_sample_name += u'-2'
					i = 3 # TODO: explain this
					while self.samples.has_key(line_sample_name):
						last_dash_index = line_sample_name.rindex('-')
						line_sample_name = "%s%s" % (
							line_sample_name[:last_dash_index+1], str(i) )
						i += 1

				sample_name = line_sample_name
				logger.debug("sample_name: %s",sample_name)

			if not line_sample_name and not sample_name: 
					logger.error("entry with no sample name found, aborting")
					return False

			# collect the other data items - grab amounts & compounds

			amount_string = line[
			    self.amount_begin_position :
			    self.amount_end_position].strip()

			compound_string = line[
			    self.compound_begin_position :
			    self.compound_end_position].strip()

			# initilize the sample entry
			if not self.samples.has_key(sample_name):
				self.samples[sample_name] = []

			# Put the value into our data structure
			if amount_string != u'-' and compound_string != u'-':
				self.samples[sample_name].append(
					self.compound_entry(compound_string,amount_string))


