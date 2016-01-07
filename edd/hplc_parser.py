##
#    This is for parsing the output of HPLC machines.
##

import sys, os


header_prefix_width = 21
header_expected_count = 6


if __name__ == "__main__":

	if len(sys.argv) != 2:
		print("usage: python hplc_parser.py input_file_path")

	input_file_path = sys.argv[1]

	print()


def parse_hplc_file(input_file_path):
	if not os.path.exists(input_file_path):
		raise IOError("Error: unable to locate file %s" % input_file_path)

	with open(input_file_path, "r", encoding="utf-8") as input_file:

		# read in header block
		header_block = [ input_file.readline() ]
		# header_block_length = 0
		while not header_block[-1].startswith("-"):
			header_block.append( input_file.readline() )

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

		# TODO: at this point you have the 'column_headers', but they are not clean
		
		# collect data



