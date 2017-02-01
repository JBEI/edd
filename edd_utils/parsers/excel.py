
"""
Convenience methods wrapping openpyxl module for handling .xlsx file I/O.
(Despite the module name, this doesn't actually do any parsing of the file
format, but it attempts to intelligently interpret the content.)
"""
from __future__ import division

import sys

from openpyxl.writer.excel import save_virtual_workbook
from openpyxl import load_workbook
from openpyxl import Workbook
from six import string_types


def export_to_xlsx(table, headers=None, title="Exported table", file_name=None):
    """
    Create a simple Excel workbook from the given table and optional headers.
    """
    assert_is_two_dimensional_list(table)
    # XXX https://bitbucket.org/openpyxl/openpyxl/issue/375/use-save_virtual_workbook-and-optimized
    wb = Workbook(write_only=False)
    ws = wb.active
    ws.title = title
    if (headers is not None):
        assert (len(table) == 0) or (len(headers) == len(table[0]))
        ws.append(headers)
    for row in table:
        ws.append(row)
    if (file_name is None):
        return save_virtual_workbook(wb)
    else:
        wb.save(file_name)
        return file_name


def import_xlsx_tables(
        file,
        column_labels=None,
        column_search_text=None,
        worksheet_id=None,
        worksheet_name=None,
        followed_by_blank_row=False,
        enforce_non_blank_cells=False,
        expect_numeric_data=False):
    """
    Process an excel file and extract the coherent table(s).  This will attempt
    to use several heuristics to identify what parts of the worksheet(s) contain
    a table.  The most reliable method is to specify column labels to search for,
    at least two of which must be found.  A more approximate method is to search
    for a specific keyword in the headers.  If neither of these are given, any
    table-like block of cells will be extracted.  In all cases, a row where the
    first expected cell is blank signals the end of a contiguous table, but
    additional rules apply for the fully-automatic extraction.

    :param file: Excel 2007+ (.xlsx) file name or handle
    :param column_labels: specific columns names to extract (not case sensitive)
    :param column_search_text: string to search for as column header (not case
        sensitive)
    :param worksheet_id: index of worksheet to extract from
    :param worksheet_name: name of worksheet to extract from
    :param followed_by_blank_row: require that a valid table be followed by an
        empty row if the end of the document has not already been reached
    :param enforce_non_blank_cells: treat rows containing blank internal cells
        as the end of a possible table
    :param expect_numeric_data: indicates that tables should contain numeric
        values (as opposed to text)
    :returns: dict of results with single 'worksheets' key (suitable for JSON
        export)
    """
    wb = load_workbook(file, read_only=True, data_only=True)
    if (len(wb.worksheets) == 0):
        raise ValueError("No worksheets found in Excel file!")
    ws = None
    if (worksheet_name is not None):
        for _ws in wb.worksheets:
            if _ws.title == worksheet_name:
                ws = [_ws]
                break
        else:
            raise KeyError("Can't find worksheet named '%s'" % worksheet_name)
    elif (worksheet_id is not None):
        ws = [wb.worksheets[worksheet_id]]
    else:
        ws = wb.worksheets
    ws_results = []
    for i_sheet, ws_ in enumerate(ws):
        try:
            ws_results.append(
                _find_table_of_values(
                    worksheet=ws_,
                    column_labels=column_labels,
                    column_search_text=column_search_text,
                    followed_by_blank_row=followed_by_blank_row,
                    enforce_non_blank_cells=enforce_non_blank_cells,
                    expect_numeric_data=expect_numeric_data))
        except ValueError as e:
            if len(ws) > 1:
                continue
            else:
                raise
    # FIXME we can do better than this...
    if (len(ws_results) == 0):
        raise ValueError(
            "No valid table-like blocks of contiguous cells found "
            "in the file.  Please make sure your spreadsheet follows format "
            "restrictions."
        )
    return {"worksheets": ws_results}


def import_xlsx_table(*args, **kwds):
    """
    Identical to import_xlsx_tables, but only returns a single table dict (or
    raises an error if more than one was found).
    """
    result = import_xlsx_tables(*args, **kwds)
    tables = result['worksheets'][0]
    if (len(result['worksheets']) > 1) or (len(tables) > 1):
        raise ValueError("Multiple tables found.")
    return tables[0]


# XXX This might be generalizable to other applications (e.g. processing
# various text files), since it can accept a Python list-of-lists as input
def _find_table_of_values(
        worksheet,
        column_labels=None,
        column_search_text=None,
        expect_numeric_data=False,
        followed_by_blank_row=False,
        minimum_number_of_data_rows=2,
        maximum_number_of_tables=sys.maxint,
        enforce_non_blank_cells=False):
    """
    Scan a worksheet for a block of cells resembling a regular table structure,
    using optional clues about content.  Returns a list of dicts with separate
    keys/value pairs for headers and actual data.  (The header list may be empty
    if no key was defined and the first row contains numeric data.)
    """
    rows = worksheet
    if (not isinstance(worksheet, list)):
        rows = worksheet_as_list_of_lists(worksheet)
    else:
        assert_is_two_dimensional_list(rows)
    n_rows = len(rows)
    if (column_search_text is not None):
        column_search_text = column_search_text.lower()
    if (column_labels is not None):
        column_labels = set([cl.lower() for cl in column_labels])
    possible_tables = []
    i_row = 0
    while (i_row < n_rows):
        row = rows[i_row]
        i_row += 1
        n_values = number_of_non_blank_cells(row)
        if n_values >= 2:
            if column_labels is not None:
                column_indices = []
                headers = []
                for i_cell, value in enumerate(row):
                    if not isinstance(value, string_types):
                        continue
                    if value.lower() in column_labels:
                        column_indices.append(i_cell)
                        headers.append(value)
                if len(headers) >= 2:
                    table = []
                    while i_row < n_rows:
                        row = [rows[i_row][k] for k in column_indices]
                        i_row += 1
                        # stop when we hit a row where (at least) the first cell is blank
                        if (row[0] is None):
                            break
                        table.append(row)
                    if (len(table) == 0):
                        raise ValueError(
                            "The column labels '%s' were found in the "
                            "worksheet, but no recognizable table of values was associated "
                            "with them." % ";".join(headers)
                        )
                    return [{
                        "headers": headers,
                        "values": table,
                    }]
            elif column_search_text is not None:
                headers = []
                table = []
                # looking for a specific column header in the row
                for i_cell, value in enumerate(row):
                    if value is None:
                        continue
                    if isinstance(value, string_types) and column_search_text in value.lower():
                        headers = row[i_cell:]
                        while (i_row < n_rows):
                            row = rows[i_row][i_cell:]
                            i_row += 1
                            if (row[0] is not None):
                                table.append(list(row))
                            else:
                                break
                        break
                if len(headers) > 0:
                    if len(table) == 0:
                        raise ValueError(
                            "The search text '%s' was found in the "
                            "worksheet, but no recognizable table of values was associated "
                            "with it." % column_search_text
                        )
                    return [{
                        "headers": headers,
                        "values": table,
                    }]
            else:
                n_numeric = number_of_numerical_cells(row)
                j_row = i_row
                tmp = []
                # start with the first non-blank cell in this row, and examine all
                # successive rows
                for i_cell, value in enumerate(row):
                    if value is None:
                        continue
                    # iterate over the following rows and see if they follow our rules
                    # for well-formed tables
                    start_row = row[i_cell:]
                    tmp.append(list(start_row))
                    while (j_row < n_rows):
                        next_row = rows[j_row][i_cell:]
                        remainder = rows[j_row][0:i_cell]  # left-ward cells
                        j_row += 1
                        if (len(next_row) != len(start_row)):
                            break
                        # case 0: there are overhanging non-blank cells to the left of
                        # the starting row
                        if number_of_non_blank_cells(remainder) > 0:
                            tmp = []
                            break
                        n_next_values = number_of_non_blank_cells(next_row)
                        n_next_numeric = number_of_numerical_cells(next_row)
                        if n_next_values == 0:
                            # blank row, definitely end of "table"
                            break
                        if enforce_non_blank_cells and n_next_values != n_values:
                            # case 1: incomplete row, strict conditions
                            break
                        elif next_row[0] is None or next_row[-1] is None:
                            # case 2: first cell is blank, not a valid row
                            if followed_by_blank_row:
                                tmp = []
                            break
                        elif n_next_values > n_values:
                            # case 3: row appears to be longer than starting row, i.e. not a
                            # consistent table structure
                            tmp = []
                            break
                        elif n_next_numeric >= 1:
                            # case 4: numerical values present - append to tmp
                            tmp.append(list(next_row))
                        # case 4b: no numeric data, but multiple non-empty cells
                        elif not expect_numeric_data and n_next_values >= 2:
                            tmp.append(list(next_row))
                        # case 5: no numeric values, and therefore not useful
                        else:
                            break
                    break
                # check that we have a reasonable number of rows in current table
                if ((len(tmp) > minimum_number_of_data_rows) or
                        (n_numeric == 0 and len(tmp) > minimum_number_of_data_rows - 1)):
                    possible_tables.append(tmp)
                    i_row = j_row
    if column_search_text is not None:
        raise ValueError(
            "The specified search text '%s' could not be associated "
            "with a column label in this spreadsheet.  Make sure the table you "
            "wish to extract obeys the required formatting rules." % column_search_text
        )
    if len(possible_tables) > maximum_number_of_tables:
        raise ValueError(
            "Multiple table-like blocks of cells identified in "
            "this worksheet - please specify a (partial) column label to search "
            "for, or provide a simpler file containing only the table of interest."
        )
    elif len(possible_tables) == 0:
        raise ValueError(
            "No table-like blocks of cells could be automatically "
            "identified in this worksheet."
        )
    else:
        tables = []
        for tmp in possible_tables:
            headers = None
            # internal consistency check
            for row in tmp[1:]:
                assert len(row) == len(tmp[0]), (len(row), len(tmp[0]))
            if number_of_numerical_cells(tmp[0]) == 0:
                headers = tmp[0]
                table = tmp[1:]
            else:
                table = tmp
            tables.append({
                "headers": headers,
                "values": table,
            })
        return tables


def worksheet_as_list_of_lists(ws):
    """Convert a Worksheet object to a 2D list."""
    table = []
    for row in ws.rows:
        table.append([c.value for c in row])
    return table


def assert_is_two_dimensional_list(table, allow_tuple_values=False):
    """
    Verify that what we expect to be a 2D list (i.e. a list of lists) really is
    that - with the optional exception of tuple cell values.
    """
    assert isinstance(table, list)
    for row in table:
        assert (isinstance(row, list) or isinstance(row, tuple)), row
        for cell in row:
            if (allow_tuple_values):
                assert (isinstance(cell, tuple) or (not hasattr(cell, "__iter__"))), cell
            else:
                assert (not hasattr(cell, "__iter__")), cell


def number_of_numerical_cells(row):
    """Count cells with int or float types."""
    numtypes = [isinstance(c, int) or isinstance(c, float) for c in row]
    return numtypes.count(True)


def number_of_non_blank_cells(row):
    """Count cells that are not None."""
    return [(c is not None) for c in row].count(True)
