
"""
Reformat CSV output from the program Skyline to consolidate MS peak areas for
individual peptides or proteins.
"""

from __future__ import division
from edd_utils.parsers import util
from collections import defaultdict
import os.path
import json
import sys

class Record (object) :
  def __init__ (self, fields) :
    self.sample = fields[0]
    self.protein = fields[1]
    self.peptide = fields[2]
    try :
      self.area = float(fields[3])
    except ValueError :
      self.area = 0

class ParseCSV (object) :
  __slots__ = ["table"]
  def __init__ (self, lines) :
    self.table = []
    for line in lines :
      line = line.strip()
      if (line == "") :
        continue
      else :
        fields = line.split(",")
        assert (len(fields) == 4)
        if (not fields[0].startswith("File")) :
          self.table.append(Record(fields))

  @property
  def proteins (self) :
    return sorted(list(set([ rec.protein for rec in self.table ])))

  @property
  def samples (self) :
    samples = []
    for rec in self.table :
      if (not rec.sample in samples) :
        samples.append(rec.sample)
    return samples

  def group_by_protein (self, include_header=True) :
    by_protein = defaultdict(float)
    samples = self.samples
    for record in self.table :
      by_protein[(record.sample, record.protein)] += record.area
    table = []
    if include_header :
      table.append(["File"] + self.proteins)
    for sample in samples :
      row = [ sample ]
      for protein in self.proteins :
        area_sum = by_protein.get((sample, protein), None)
        row.append(area_sum)
      table.append(row)
    return table

  def show_by_protein (self, out=sys.stdout) :
    table = self.group_by_protein()
    for row in util.format_rows_for_minimum_field_size(table) :
      print >> out, " ".join(row)
    return self

  def compress_rows (self, include_header=True) :
    rows = []
    if (include_header) :
      rows.append([ "File", "Protein", "Total_Area" ])
    for sample in self.samples :
      by_protein = defaultdict(float)
      for record in self.table :
        if (record.sample == sample) :
          by_protein[record.protein] += record.area
      for protein in sorted(by_protein.keys()) :
        rows.append([ sample, protein, by_protein[protein] ])
    return rows

  def export (self, n_expected=None) :
    return {
      "n_records" : len(self.table),
      "n_proteins" : len(self.proteins),
      "n_samples" : len(self.samples),
      "by_protein" : self.group_by_protein(),
      "rows" : self.compress_rows(),
      "errors" : [],
    }

if (__name__ == "__main__") :
  data = open(sys.argv[1], "U").read().splitlines()
  ParseCSV(data).show_by_protein()
