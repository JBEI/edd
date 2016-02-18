#!/usr/bin/python

"""
Interpret a Biolector XML file, creating a series of measurement sets suitable for passing to
Step 2 of the EDD Data Table Import page.
"""

from __future__ import unicode_literals

from optparse import OptionParser
import sys
import copy
import logging

from xml.dom import pulldom
from xml.sax import handler
from xml.sax.expatreader import ExpatParser as _ExpatParser
from django.utils import six

logger = logging.getLogger('main.views')  # Man, I know I am totally Doing This Wrong, but I can't figure it out just now


class XMLImportError(Exception):
    """Something bad happened during deserialization."""


class RawImportRecord(object):
    """
    A "raw" record for measurement import, suitable for passing to Step 2 of the EDD Data Table Import page.
    Think of it as a crude form of an Assay (only one measurement type allowed, and its value array).
    It provides a series of data points, and places for strings meant to be resolved into record identifiers
    (by Step 4 in the front end for example) such as Line/Assay, Measurement (name of General/Metabolite/Gene/etc),
    and Metadata names/values.
    The import page submits a complementary data structure back to the server, including the original fields but
    also resolving the ambiguous strings to primary keys of real records.  The server uses both structures to finalize the submission.
    (In some situations - like small tab/csv documents - the parsing is all done client-side, and in that case the client
    does not receive any original RawImportRecords from the server.)
    The eventual goal is to standardize part of the data import pipeline across different sources and/or document types.
    (It may be necessary to subclass RawImportRecord if a given data source needs to transmit additional fields.)
    """

    def __init__(self, kind="std", name="NoName", line_name=None, assay_name=None, data=[], metadataName={}):
        self.kind = kind
        self.assay_name = assay_name
        self.line_name = line_name
        self.measurement_name = name
        self.metadata_by_name = copy.deepcopy(metadataName)
        self.data = copy.deepcopy(data)

    def __repr__(self):
        return "<%s RawImportRecord '%s', A:'%s', %s data points>" % (
            self.kind, self.name, self.assay_name, len(self.data))

    def to_json(self, depth=0):
        return {
            "kind": self.kind,
            "line_name": self.line_name,
            "assay_name": self.assay_name,
            "measurement_name": self.measurement_name,
            "metadata_by_name": self.metadata_by_name,
            "data": self.data,
        }



def getBiolectorXMLRecordsAsJSON(stream_or_string, thin=0):
  records = []
  for item in BiolectorXMLReader(stream_or_string, thin=thin):
    j = item.to_json()
    #logger.warning('Set (%s)' % (item))
    records.append(j)
  return records



class BiolectorXMLReader(six.Iterator):
    """
    Given a Biolector XML document as a stream or string, translate it into a series of RawImportRecord objects.
    """

    def __init__(self, stream_or_string, **options):

        self.rawImportRecordBuffer = []
        self.options = options
        if isinstance(stream_or_string, six.string_types):
            self.stream = six.StringIO(stream_or_string)
        else:
            self.stream = stream_or_string

        self.event_stream = pulldom.parse(self.stream, self._make_parser())
        self.thin = options.pop('thin', 0)


    def _make_parser(self):
        """Create a hardened XML parser (no custom/external entities)."""
        return DefusedExpatParser()


    def __next__(self):
        # If we have a built RawImportRecord in the buffer, return it.
        if len(self.rawImportRecordBuffer) > 0:
          #logger.warning('Popping from buffer with length %s' % (len(self.rawImportRecordBuffer)))
          return self.rawImportRecordBuffer.pop()

        # If the buffer is empty, we add a new chunk of RawImportRecord objects to it,
        # by rolling through this ugly finite state machine until we hit the closing of a Fermentation element.
        # (RawImportRecords are most easy to create in quantity, since a Fermentation node contains
        # many record' worth of measurements, and contains a Line name and metadata that applies to all of them.)

        # Accumulated at the Fermantation element level
        line_name = None
        well = None
        wellindex = None
        content = None
        # We turn this flag on when we're inside a '<CalibratedData>' element.
        # That way we ignore any accumulated curve data that's inside a '<RawData>' element.
        calibrated_data = False

        # A template for metadata for each RawImportRecord, embedded en-masse at the close of a Fermantation element
        metaData = {}

        # Accumulated at the Curve level
        assay_name = None
        measurement = None
        new_import_record_buffer = []

        # Accumulated at the CurvePoint level
        runtime = None
        numeric_value = None
        measurement_point_buffer = []

        # Accumulated everywhere, whenever we encounter a text node in the document
        temp_string_buffer = []
        temp_string = ''

        # Note that this code used to be written to leverage the 'expandNode' method.
        # Well, 'expandNode' has a serious problem with fully populating grandchild nodes, and calling it on
        # END_ELEMENT instead of START_ELEMENT often causes Python to iterate back on itself and dump core.
        # Furthermore, one can't rely on a node's children or text elements of children to be populated when
        # hitting an END_ELEMENT event, so we have to watch for each element individually and keep our own
        # state to track where it is.
        #   On top of that, the CHARACTERS event is not guaranteed to handle entire text nodes at once, so
        # we need to buffer sequential CHARACTERS events until we get some other event, then join and wipe the buffer.

        # It's a lot of pain to work around, but the end result is, we can build a nice compact data structure
        # without ever keeping more than a tiny fragment of the input file in memory at a time,
        # so we can handle Biolector xml files in the hundreds-of-megabytes without trouble.

        for event, node in self.event_stream:
          if event == pulldom.CHARACTERS:
            temp_string_buffer.append(node.nodeValue)
            continue
          temp_string = ''.join(temp_string_buffer)
          temp_string_buffer = []

          if event == pulldom.START_ELEMENT and node.nodeName == "CalibratedData":
            calibrated_data = True
          if event == pulldom.END_ELEMENT and node.nodeName == "CalibratedData":
            calibrated_data = False

          if event == pulldom.END_ELEMENT and node.nodeName == "Description":
            line_name = temp_string

          # Accumulating the metadata structure
          if event == pulldom.END_ELEMENT and node.nodeName == "Well":
            well = temp_string
            if well is not None and well != "":
              metaData["Bio:well"] = well
          if event == pulldom.END_ELEMENT and node.nodeName == "WellIndex":
            wellindex = temp_string
            if wellindex is not None and wellindex != "":
              metaData["Bio:well index"] = wellindex
          if event == pulldom.END_ELEMENT and node.nodeName == "Content":
            content = temp_string
            if content is not None and content != "":
              metaData["Bio:well content"] = content

          if event == pulldom.END_ELEMENT and node.nodeName == "Key":
            measurement = temp_string
          if event == pulldom.END_ELEMENT and node.nodeName == "Name":
            assay_name = temp_string
          if event == pulldom.END_ELEMENT and node.nodeName == "Curve":
            if calibrated_data:
              # At the end of each Curve element, we dump our accumulated measurements into a new RawImportRecord.
              new_import_record_buffer.append(RawImportRecord("biolector", measurement, line_name, assay_name, measurement_point_buffer, metaData))
            measurement_point_buffer = []

          # At the close of every CurvePoint we append a measurement point to our buffer
          if event == pulldom.END_ELEMENT and node.nodeName == "RunTime":
            runtime = temp_string
          if event == pulldom.END_ELEMENT and node.nodeName == "NumericValue":
            numeric_value = temp_string
          if event == pulldom.END_ELEMENT and node.nodeName == "CurvePoint":
            measurement_point_buffer.append([runtime, numeric_value])
            # This is not technically neccessary but is good housekeeping
            runtime = None
            numeric_value = None

          # At the end of a Fermentation element, we run back over the accumulated list
          # of new RawImportRecord objects and finalize their names.
          if event == pulldom.END_ELEMENT and node.nodeName == "Fermentation":
            if line_name is None or line_name == "":
              line_name = ' '.join([content, well, wellindex])
            for new_import_record in new_import_record_buffer:
              new_import_record.line_name = line_name
            self.rawImportRecordBuffer.extend(new_import_record_buffer)
            new_import_record_buffer = []
            metaData = {}
            #logger.warning('Extended buffer to length %s' % (len(self.rawImportRecordBuffer)))
            if len(self.rawImportRecordBuffer) > 0:
              return self.rawImportRecordBuffer.pop()

          # If we haven't used the temp_string during the non-CHARACTERS event directly
          # following it, we should consider it stale and discard it.
          # At first this may seem overly restrictive but it actually makes sense.
          temp_string = ''

        # If buffer is empty and the stream is empty, we're done.
        raise StopIteration


    def __iter__(self):
        return self



def getTextInSubElement(node, name, default):
  for sub_node in node.getElementsByTagName(name):
    return getInnerText(sub_node)
  return default


#
# Code below lifted from /django/core/serializers/xml_serializer.py 
#

# Copyright (c) Django Software Foundation and individual contributors.
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without modification,
# are permitted provided that the following conditions are met:
#
#    1. Redistributions of source code must retain the above copyright notice,
#       this list of conditions and the following disclaimer.
#
#    2. Redistributions in binary form must reproduce the above copyright
#       notice, this list of conditions and the following disclaimer in the
#       documentation and/or other materials provided with the distribution.
#
#    3. Neither the name of Django nor the names of its contributors may be used
#       to endorse or promote products derived from this software without
#       specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
# ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


def getInnerText(node):
    """
    Get all the inner text of a DOM node (recursively).
    """
    # inspired by http://mail.python.org/pipermail/xml-sig/2005-March/011022.html
    inner_text = []
    for child in node.childNodes:
        if child.nodeType == child.TEXT_NODE or child.nodeType == child.CDATA_SECTION_NODE:
            inner_text.append(child.data)
        elif child.nodeType == child.ELEMENT_NODE:
            inner_text.extend(getInnerText(child))
        else:
            pass
    return "".join(inner_text)


class DefusedExpatParser(_ExpatParser):
    """
    An expat parser hardened against XML bomb attacks.
    Forbids DTDs, external entity references
    """
    def __init__(self, *args, **kwargs):
        _ExpatParser.__init__(self, *args, **kwargs)
        self.setFeature(handler.feature_external_ges, False)
        self.setFeature(handler.feature_external_pes, False)

    def start_doctype_decl(self, name, sysid, pubid, has_internal_subset):
        raise DTDForbidden(name, sysid, pubid)

    def entity_decl(self, name, is_parameter_entity, value, base,
                    sysid, pubid, notation_name):
        raise EntitiesForbidden(name, value, base, sysid, pubid, notation_name)

    def unparsed_entity_decl(self, name, base, sysid, pubid, notation_name):
        # expat 1.2
        raise EntitiesForbidden(name, None, base, sysid, pubid, notation_name)

    def external_entity_ref_handler(self, context, base, sysid, pubid):
        raise ExternalReferenceForbidden(context, base, sysid, pubid)

    def reset(self):
        _ExpatParser.reset(self)
        parser = self._parser
        parser.StartDoctypeDeclHandler = self.start_doctype_decl
        parser.EntityDeclHandler = self.entity_decl
        parser.UnparsedEntityDeclHandler = self.unparsed_entity_decl
        parser.ExternalEntityRefHandler = self.external_entity_ref_handler


class DefusedXmlException(ValueError):
    """Base exception."""
    def __repr__(self):
        return str(self)


class DTDForbidden(DefusedXmlException):
    """Document type definition is forbidden."""
    def __init__(self, name, sysid, pubid):
        super(DTDForbidden, self).__init__()
        self.name = name
        self.sysid = sysid
        self.pubid = pubid

    def __str__(self):
        tpl = "DTDForbidden(name='{}', system_id={!r}, public_id={!r})"
        return tpl.format(self.name, self.sysid, self.pubid)


class EntitiesForbidden(DefusedXmlException):
    """Entity definition is forbidden."""
    def __init__(self, name, value, base, sysid, pubid, notation_name):
        super(EntitiesForbidden, self).__init__()
        self.name = name
        self.value = value
        self.base = base
        self.sysid = sysid
        self.pubid = pubid
        self.notation_name = notation_name

    def __str__(self):
        tpl = "EntitiesForbidden(name='{}', system_id={!r}, public_id={!r})"
        return tpl.format(self.name, self.sysid, self.pubid)


class ExternalReferenceForbidden(DefusedXmlException):
    """Resolving an external reference is forbidden."""
    def __init__(self, context, base, sysid, pubid):
        super(ExternalReferenceForbidden, self).__init__()
        self.context = context
        self.base = base
        self.sysid = sysid
        self.pubid = pubid

    def __str__(self):
        tpl = "ExternalReferenceForbidden(system_id='{}', public_id={})"
        return tpl.format(self.sysid, self.pubid)


#
# End of code from /django/core/serializers/xml_serializer.py 
#


def run (args, out=sys.stdout, err=sys.stderr) :
  parser = OptionParser()
  parser.add_option("--csv", dest="csv", action="store_true",
    help="Output result in CSV format for Excel import")
  parser.add_option("--n-peaks", dest="n_peaks", action="store", type="int",
    help="Number of peaks expected")
  parser.add_option("--quiet", dest="quiet", action="store_true",
    help="Suppress non-essential output")
  options, args = parser.parse_args(args)
  assert len(args) == 1
  result = Report(open(args[0], 'U').readlines())
  assert (len(result.samples) > 0)
  if options.quiet :
    err = StringIO()
  if options.csv :
    result.show_peak_areas_csv(n_expected=options.n_peaks,
      out=out, err=err)
  else :
    result.show_peak_areas(n_expected=options.n_peaks,
      out=out, err=err)
  return result

if (__name__ == "__main__") :
  run(sys.argv[1:])
