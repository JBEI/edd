#!/usr/bin/python

"""
Command-line interface to the Biolector parser.
"""

from __future__ import unicode_literals

from optparse import OptionParser
import sys
import os
import json

from parser import getBiolectorXMLRecordsAsJSON, BiolectorXMLReader, RawImportRecord, XMLImportError



class JSONObjectEncoder(json.JSONEncoder):
  
    def default(self, obj):
        if isinstance(obj, set):
            return list(obj)
        if isinstance(obj, frozenset):
            return list(obj)
        if hasattr(obj, 'toJSONable'):
            return obj.toJSONable()
        return json.JSONEncoder.default(self, obj)


def run (args, out=sys.stdout, err=sys.stderr) :
  parser = OptionParser()
  parser.add_option("--test", dest="test", action="store_true",
    help="Test the Biolector parser with an included example XML file")
  parser.add_option("--thin", dest="thin", action="store", type="int",
    help="Maximum quantity to thin each Measurement value set down to (currently unsupported)")
  options, args = parser.parse_args(args)
  if options.test:
    filename = os.path.join(os.path.dirname(__file__), "biolector_test_file.xml")
  else:
    assert len(args) == 1
    filename = args[0]
  file = open(filename, 'U')
  results = getBiolectorXMLRecordsAsJSON(file, options.thin)
  assert (len(results) > 0)
  result_string = "\n".join(json.dumps(result, cls = JSONObjectEncoder) for result in results)
  print >> out, result_string
  if options.test:
    print "\nShould have 48 records.  Number of records: %s" % len(results)
    assert len(results) == 48
    last_v = results[-1]['data'][-1][1]
    print "Last value in data array of last record should be 8.829, is %s" % last_v
    assert (last_v == "8.829")
    well_v = results[20]['metadata_by_name']['Bio:well']
    print "20th set should have metadata Bio:well set to C05, is %s" % well_v
    assert (well_v == "C05")
  return result_string


if (__name__ == "__main__") :
  run(sys.argv[1:])
