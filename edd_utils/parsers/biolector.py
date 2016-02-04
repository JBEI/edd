#!/usr/bin/python

"""
Interpret a Biolector XML file (as a string), creating a series of measurement sets suitable for passing to
Step 2 of the EDD Data Table Import page.
"""

from __future__ import unicode_literals

from optparse import OptionParser
import sys
import logging

from xml.dom import pulldom
from xml.sax import handler
from xml.sax.expatreader import ExpatParser as _ExpatParser
from django.utils import six

logger = logging.getLogger('main.views')  # Man, I know I am totally Doing This Wrong, but I can't figure it out just now


class XMLImportError(Exception):
    """Something bad happened during deserialization."""

    @classmethod
    def WithData(cls, original_exc, model, fk, field_value):
        """
        Factory method for creating a deserialization error which has a more
        explanatory messsage.
        """
        return cls("%s: (%s:pk=%s) field_value was '%s'" % (original_exc, model, fk, field_value))


class RawImportRecord(object):
    """
    A "raw" record for measurement import, suitable for passing to Step 2 of the EDD Data Table Import page.
    Think of it as a crude form of an Assay (only one measurement type allowed, and its value array) with ambiguous strings for names.
    It provides a series of data points, and places for strings meant to be resolved into record identifiers
    (by Step 4 in the front end for example) such as Line/Assay, Name (of Measurement/Gene/etc), and Metadata names/values.
    The intention is to eventually make the import page submit the same data structure back to the server,
    with the resolved values added in - perhaps turning it into a hypothetical "FilledImportRecord" that is a subclass of this class.
    Then after passing that milestone, we can actually stop passing the redundant values back and forth, and just keep
    them on the server and fill them in, creating the "FilledImportRecord" objects server-side.
    At that point we will be in a position to unify ALL multi-step import processes (the ones that involve a disambiguation or
    verification step) under one roof.
    """

    def __init__(self, kind="std", name="NoName", assayName=None, data=[], metadataName={}):
        self.kind = kind
        self.assayName = assayName
        self.name = name
        self.metadataName = metadataName
        self.data = data

    def __repr__(self):
        return "<%s RawImportRecord '%s', A:'%s', %s data points>" % (
            self.kind, self.name, self.assayName, len(self.data))

    def to_json(self, depth=0):
        return {
            "kind": self.kind,
            "assayName": self.assayName,
            "name": self.name,
            "metadataName": self.metadataName,
            "data": self.data,
        }



def getBiolectorXMLRecordsAsJSON(stream_or_string, thin=0):
  records = []
  for item in BiolectorXMLReader(stream_or_string, thin=thin):
    j = item.to_json()
    # logger.warning('Set (%s)' % (j))
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
          return self.rawImportRecordBuffer.pop()
        # If the buffer is empty, add a new chunk of RawImportRecord objects to it.
        # (They are most easy to create in quantity, since a Fermentation node contains
        # many sets' worth of measurements, and contains name data that applies to all of them.)
        for event, node in self.event_stream:
            if event == "START_ELEMENT" and node.nodeName == "Fermentation":
                self.event_stream.expandNode(node)
                self.rawImportRecordBuffer.extend(self._handle_object(node))
                if len(self.rawImportRecordBuffer) > 0:
                  return self.rawImportRecordBuffer.pop()
        # If buffer is empty and the stream is empty, we're done.
        raise StopIteration


    def __iter__(self):
        return self


    def _handle_object(self, node):
        """
        Convert a <Fermentation> node to a list of RawImportRecord objects.
        """
        assayName = getTextInSubElement(node, "Description", "")
        well = getTextInSubElement(node, "Well", "")
        wellindex = getTextInSubElement(node, "WellIndex", "")
        content = getTextInSubElement(node, "Content", "")

        # We count on the experimenter putting a sensible Assay name in the description,
        # but if the description is blank, try to cobble something together...
        if assayName is None or assayName == "":
          assayName = ' '.join([content, well, wellindex])

        if assayName is None or assayName == "":
          raise XMLImportError("<Fermentation> node lacks enough info to create a name!")

        metaDataTemplate = {}
        if well is not None and well != "":
          metaDataTemplate["well"] = well
        if wellindex is not None and wellindex != "":
          metaDataTemplate["well index"] = wellindex
        if content is not None and content != "":
          metaDataTemplate["well content"] = content

        newObjects = []

        for cal_sets in node.getElementsByTagName("CalibratedData"):
          for one_set in cal_sets.getElementsByTagName("CalibratedDataSet"):
            for one_curve in one_set.getElementsByTagName("Curves"):
              metaData = metaDataTemplate.copy()
              name = getTextInSubElement(one_curve, "Name", "Unknown")
              data = []
              for one_point in one_curve.getElementsByTagName("ListOfPoints"):
                x = getTextInSubElement(one_point, "RunTime", None)
                y = getTextInSubElement(one_point, "NumericValue", None)
                data.append([x, y])
                newObjects.append(RawImportRecord("biolector", name, assayName, data, metaData))

        return newObjects



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
