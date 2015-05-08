
from __future__ import division

def format_rows_for_minimum_field_size (table) :
  """
  Given a 2D table of arbitrary values that we want to print in neat columns,
  determine the column widths and return an equivalent formatted table.
  """
  transposed = [ [ row[k] for row in table ] for k in range(len(table[0])) ]
  lengths = [ max([ len(str(cell)) for cell in col ]) for col in transposed ]
  formats = [ "%%%ds" % n for n in lengths ]
  formatted = [ [ formats[k] % cell for k, cell in enumerate(row) ]
                for row in table ]
  return formatted
