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

	with open(input_file_path) as input_file:

		# read in header block
		header_block = [ input_file.readline() ]
		while not header_block[-1].startswith("-"):
			header_block.append( input_file.readline() )

		# the title line is first, and unused
		# title_line = header_block[0]
		
		# collect header data

		# collect table header

		# collect widths

		# collect data


