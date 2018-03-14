# -*- coding: utf-8 -*-
"""
This is for parsing the output of HPLC machines.
"""

import chardet
import logging
import re

from collections import defaultdict, OrderedDict, namedtuple
from decimal import Decimal

from .util import RawImportRecord


logger = logging.getLogger(__name__)


def getRawImportRecordsAsJSON(request):
    # We pass the request directly along, so it can be read as a stream by the parser
    parser = HPLC_Parser(request)

    records = []
    for record in parser.parse_hplc():
        metadata = {}
        raw_record = RawImportRecord(
            "hplc",
            record.compound,
            record.line,
            record.assay,
            record.timepoints,  # warning: shallow copy(s)
            metadata,
        )
        j = raw_record.to_json()
        records.append(j)
    return records


# Returns an iterator of the given stream.
# There's probably a utility function in the python standard library for this...
def iterate_as_lines(stream):
    for line in stream.split("\n"):
        yield line


class HplcError(Exception):
    pass


class HplcInputError(HplcError):
    pass


class HplcAlignmentError(HplcError):
    pass


CompoundRecord = namedtuple('CompoundRecord', ['compound', 'line', 'assay', 'timepoints', ])
CompoundEntry = namedtuple('CompoundEntry', ['compound', 'amount'])


class HPLC_Parser(object):

    # The maximum number of lines to read before giving up on finding the header
    max_header_line_count = 20

    def __init__(self, input_stream):

        if not input_stream:
            raise HplcInputError("No data stream provided")

        self.input_stream = input_stream   # The stream that is being parsed
        self.decoded_stream = None

        # samples format: { 'Sample Name': [CompoundEntry('compound', 'amount'), ...], ... }
        self.samples = OrderedDict()       # The final data resulting from batch parsing

        self.has_parsed = False
        self.formatted_results = None

        # regex formulated with the nifty https://regex101.com/ tool
        # reads a samples name and captures (line, Time, assay)
        self.sample_name_regex = re.compile(r'(.*)_HPLC@([0-9]+(?:\.[0-9]*)?)(?:_([^@]+))?')

        # Integer indices for standard format parsing
        self.amount_begin = None
        self.amount_end = None
        self.compound_begin = None
        self.compound_end = None

        self.expected_row_count = None
        self.current_line = 0
        self.saved_line = 0

    def parse_hplc(self):
        """Parses textual HPLC data from the input stream, returning data formatted for use.

        THIS CLASS IS NOT THREAD SAFE.

        returns records = [('compound', 'line', 'assay', timepoints[[time, amount], ...]), ...]
        ( assay may be None )
        """
        if self.has_parsed:
            return self.formatted_results
        self.has_parsed = True
        self.decoded_stream = self._decode_input_stream()

        # TODO: Verify that long sample names don't clip!
        #        ...This can't be test without interacting with the HPLC machine.
        # TODO: format detection is fragile... needs attention
        # TODO: Add option to return `None`s for unidenfified peaks
        # TODO: capture other data elements, and return or not based on option
        # # ? : Messages -> Logger

        # TODO: Add warning if line is shorter then expected

        firstline = next(self.decoded_stream)

        # This is what we use to detect a 96-well-format HPLC file.
        if firstline.startswith("Batch"):
            logger.info("Detected 96 well format in HPLC file")
            self._parse_96_well_format_samples()
        else:
            logger.info("Detected standard format in HPLC file")
            header_block = self._parse_file_header()

            logger.debug("collecting the table_header")
            (header_block, table_header, table_divider) = self._get_table_header(header_block)

            logger.debug("parsing column widths")
            section_widths = self._get_section_widths(table_divider)

            logger.debug("collecting the column_headers")
            self._extract_column_headers_from_multiline_text(section_widths, table_header)

            # Read in each line and contruct records
            logger.debug("now reading in the data")

            # Collect Sample Name
            sample_name = None

            # Loop - collect each line associated with the sample
            for (line_number, line) in enumerate(self.decoded_stream, 2):
                if line.strip() == '':  # Skip blank line
                    continue
                self.current_line = line_number
                # get the name of the sample related to the row
                new_sample_name = line[:section_widths[0]].strip()

                if new_sample_name:
                    sample_name = new_sample_name
                    self.samples.setdefault(sample_name, list())
                if not new_sample_name and not sample_name:
                    logger.error(
                        "Continuation entry specified before sample name entry.\n\t%d: %s",
                        line_number, line.strip()
                    )
                    break

                # collect the other data items - grab amounts & compounds
                amount = line[self.amount_begin:self.amount_end].strip()
                compound = line[self.compound_begin:self.compound_end].strip()

                # Put the value into our data structure
                if amount != '-' and compound != '-':
                    self.samples[sample_name].append(CompoundEntry(compound, amount))

        logger.info("HPLC parsing finished.")

        self.formatted_results = self._format_samples_for_raw_input_record()
        return self.formatted_results

    def _decode_input_stream(self):
        # Apparently the HPLC machine generates documents in UTF-16?
        # Iterating over unknown UTF lines in an io stream gives rather unpredictable results.
        # There is no perfect way to determine the encoding while still parsing the stream,
        # unless we use an iterator and buffer everything accumulated while guessing,
        # then decode our buffer all at once using the guess, and pass the rest of the stream to
        # another iterator with the guess explicit:

        #   binary_chunks = iter(partial(input.read, 1), "")
        #   for unicode_chunk in iterdecode(binary_chunks, encoding):
        #       yield unicode_chunk

        # ...And since HPLC files are really never very big, we're going to forget about
        # stream parsing, and just slurp it all in here, detect the encoding, then decode
        # it all at once.

        # Future reference:
        # http://blog.etianen.com/blog/2013/10/05/python-unicode-streams/
        # https://github.com/facelessuser/Rummage/blob/master/rummage/rummage/rumcore/text_decode.py
        # http://chardet.readthedocs.org/en/latest/usage.html

        raw_string = self.input_stream.read()
        chardet_result = chardet.detect(raw_string)
        if chardet_result is None:
            raise HplcInputError("unable to determine encoding of document")

        encoding = chardet_result['encoding']
        logger.info("detected encoding %s", encoding)
        try:
            return iterate_as_lines(raw_string.decode(encoding))
        except Exception:
            raise HplcInputError("unable to decode document using guessed encoding %s", encoding)

    def _format_samples_for_raw_input_record(self):

        # { compound: [ compound_record_for_assay1, ... ], ... }
        compound_record_dict = defaultdict(list)

        for (name, sample) in self.samples.items():
            # Collects the DB names from the name.
            line = time = assay = None
            match_result = self.sample_name_regex.match(name)
            if match_result:
                # Note: assay may be None
                line, time, assay = match_result.group(1, 2, 3)
            else:
                # if the name is not in expected format...
                line = name
                logger.warning(
                    "Sample name '%s' not in the expected format! [LINE]_HPLC@[TIME] or "
                    "[LINE]_HPLC@[TIME]_[REPLICATE]",
                    name,
                )

            # create formatted record for each compund entry
            for entry in sample:
                try:
                    value = Decimal(entry.amount)
                    record = CompoundRecord(entry.compound, line, assay, [[time or 0, value]])
                    compound_record_dict[entry.compound].append(record)
                except ValueError:
                    logger.warning('Could not interpret value %s', entry.amount)
                    continue

        compound_records = []
        for key in compound_record_dict:
            compound_records.extend(compound_record_dict[key])

        return compound_records

    def _parse_file_header(self):

        header_block = []
        i = 0
        while True:
            line = next(self.decoded_stream)
            self.current_line += 1
            header_block.append(line)
            i += 1

            if line.startswith("-"):
                break
            if "*** End of Report ***" in line:
                break
            if line == '':
                raise HplcInputError(
                    "unable to find header: EOF encountered at line %d",
                    self.current_line)
            if i >= HPLC_Parser.max_header_line_count:
                raise HplcInputError(
                    "unable to find header: header not closed after %d lines",
                    HPLC_Parser.max_header_line_count)
        return header_block

    def _get_table_header(self, header_block):
        # collect table header, "Sample Name", etc.
        # cliping it off the end of the header block
        table_header = []
        table_divider = header_block[-1]  # indicates column widths
        r_index = -2
        line = header_block[r_index]
        while line != "" and not line.isspace():
            table_header.append(line)
            r_index -= 1
            line = header_block[r_index]
        table_header.reverse()

        # collect header data, currently not parsed
        # (removes table header from header block)
        header_block = header_block[1:r_index]

        return header_block, table_header, table_divider

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

    def _extract_column_headers_from_multiline_text(self, section_widths, table_header):

        # collect the multiline text
        column_headers = [''] * len(section_widths)
        for line in table_header:
            section_width_carryover = 0
            for (section_index, section_width) in enumerate(section_widths):

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
                else:  # account for extra character in next section
                    section_width_carryover = 1
                column_headers[section_index] += segment

        # each value is indexed by column header, clean up headers
        for i, header_tokens in enumerate(map(lambda h: h.split(), column_headers)):
            header = ' '.join(header_tokens)
            column_headers[i] = header

            logger.debug("header: %s", header)

            if header.startswith('Amount'):
                self.amount_begin = sum(section_widths[:i]) + len(section_widths[:i])
                self.amount_end = section_widths[i] + self.amount_begin
            elif header.startswith('Compound'):
                self.compound_begin = sum(section_widths[:i]) + len(section_widths[:i])
                self.compound_end = section_widths[i] + self.compound_begin

        return column_headers

    def _parse_96_well_format_block(self, sample_names, compounds, column_headers, section_widths):
        """Reads in a single block of data from file"""

        for line_number, line in enumerate(self.decoded_stream):
            self.current_line = line_number

            if self.expected_row_count and line_number > self.expected_row_count:
                raise HplcAlignmentError("More rows found then expected!")

            if line.startswith('#'):
                if self.expected_row_count and line_number < self.expected_row_count:
                    raise HplcAlignmentError("Less rows found then expected!")
                break

            for index, header in enumerate(column_headers):
                if "Sample" in header:
                    begin_position = sum(section_widths[:index]) + len(section_widths[:index])
                    end_position = section_widths[index] + begin_position
                    name = line[begin_position:end_position].strip()
                    # sample names is implicitly indexed by line_number
                    sample_names.append(name)
                elif "Amount" in header:
                    begin_position = sum(section_widths[:index]) + len(section_widths[:index])
                    end_position = section_widths[index] + begin_position
                    amount = line[begin_position:end_position].strip()
                    if Decimal(amount) == 0.0:
                        continue
                    compound = column_headers[index].replace("Amount", "").strip()
                    compounds.append((line_number, CompoundEntry(compound, amount)))

        return sample_names, compounds

    def _parse_96_well_format_samples(self):
        """Collects the samples from a 96 well plate format file

        Format: [ (compound_string, amount_string), ...] """

        sample_names = []
        compounds = []

        # collect all the sample names
        # ...

        while True:
            logger.debug("collecting the header_block")
            header_block = self._parse_file_header()

            if "*** End of Report ***" in header_block[-1]:
                break

            logger.debug("collecting the table_header")
            (header_block, table_header, table_divider) = self._get_table_header(header_block)

            logger.debug("parsing column widths")
            section_widths = self._get_section_widths(table_divider)

            logger.debug("collecting the column_headers")
            column_headers = self._extract_column_headers_from_multiline_text(
                section_widths, table_header
            )

            self._parse_96_well_format_block(
                sample_names, compounds, column_headers, section_widths
            )

        # Line up the sample name with the amounts
        for indexed_compound in compounds:
            line_number, compound = indexed_compound
            sample_name = sample_names[line_number]
            if sample_name in self.samples:
                self.samples[sample_name].append(compound)
            else:
                self.samples[sample_name] = [compound]
