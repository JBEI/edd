#!/usr/bin/python
# coding: utf-8
"""
Interpret a Biolector XML file, creating a series of measurement sets suitable for passing to
Step 2 of the EDD Data Table Import page.
"""

import logging
from xml.dom import pulldom
from xml.sax import handler
from xml.sax.expatreader import ExpatParser as _ExpatParser

from django.utils import six

from ..util import RawImportRecord

logger = logging.getLogger(__name__)


class XMLImportError(Exception):
    """Something bad happened during deserialization."""


def getRawImportRecordsAsJSON(stream_or_string, thin=0):
    return [item.to_json() for item in BiolectorXMLReader(stream_or_string, thin=thin)]


class BiolectorState(object):
    # If the buffer is empty, we add a new chunk of RawImportRecord objects to it, by rolling
    # through this ugly finite state machine until we hit the closing of a Fermentation element
    # (RawImportRecords are most easy to create in quantity, since a Fermentation node contains
    # many record' worth of measurements, and contains a Line name and metadata that applies to
    # all of them.)

    # Accumulated at the Fermantation element level
    line_name = None
    well = None
    wellindex = None
    content = None
    # We turn this flag on when we're inside a '<CalibratedData>' element.
    # That way we ignore any accumulated curve data that's inside a '<RawData>' element.
    calibrated_data = False

    # A template for metadata for each RawImportRecord, embedded en-masse at the close of a
    # Fermantation element
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
    temp_string = ""

    ready = False

    def start(self, nodeName):
        self.text_get()
        func = getattr(self, f"start_{nodeName}", None)
        if callable(func):
            func()
        self.temp_string = ""

    def end(self, nodeName):
        self.text_get()
        func = getattr(self, f"end_{nodeName}", None)
        if callable(func):
            func()
        self.temp_string = ""

    def collect(self):
        results = []
        if self.ready:
            results = [item for item in self.new_import_record_buffer]
            self.new_import_record_buffer.clear()
            self.metaData = {}
            self.ready = False
        return results

    def text_add(self, value):
        self.temp_string_buffer.append(value)

    def text_get(self):
        self.temp_string = "".join(self.temp_string_buffer)
        self.temp_string_buffer = []

    def set_meta(self, field, value):
        if value is not None and value != "":
            self.metaData[field] = value

    def start_CalibratedData(self):
        self.calibrated_data = True

    def end_CalibratedData(self):
        self.calibrated_data = False

    def end_Description(self):
        self.line_name = self.temp_string

    def end_Well(self):
        self.well = self.temp_string
        self.set_meta("Bio:well", self.well)

    def end_WellIndex(self):
        self.wellindex = self.temp_string
        self.set_meta("Bio:well index", self.wellindex)

    def end_Content(self):
        self.content = self.temp_string
        self.set_meta("Bio:well content", self.content)

    def end_Key(self):
        self.measurement = self.temp_string

    def end_Name(self):
        self.assay_name = self.temp_string

    def end_RunTime(self):
        self.runtime = self.temp_string

    def end_NumericValue(self):
        self.numeric_value = self.temp_string

    def end_CurvePoint(self):
        self.measurement_point_buffer.append([self.runtime, self.numeric_value])
        # This is not technically neccessary but is good housekeeping
        self.runtime = None
        self.numeric_value = None

    def end_Curve(self):
        if self.calibrated_data:
            self.new_import_record_buffer.append(
                RawImportRecord(
                    "biolector",
                    self.measurement,
                    self.line_name,
                    self.assay_name,
                    self.measurement_point_buffer,
                    self.metaData,
                )
            )
        self.measurement_point_buffer = []

    def end_Fermentation(self):
        if not self.line_name:
            self.line_name = " ".join([self.content, self.well, self.wellindex])
            for new_import_record in self.new_import_record_buffer:
                new_import_record.line_name = self.line_name
        self.ready = True


class BiolectorXMLReader(six.Iterator):
    """
    Given a Biolector XML document as a stream or string, translate it into a series of
    RawImportRecord objects.
    """

    def __init__(self, stream_or_string, **options):

        self.rawImportRecordBuffer = []
        self.options = options
        if isinstance(stream_or_string, six.string_types):
            self.stream = six.StringIO(stream_or_string)
        else:
            self.stream = stream_or_string

        self.event_stream = pulldom.parse(self.stream, self._make_parser())
        self.thin = options.pop("thin", 0)

    def _make_parser(self):
        """Create a hardened XML parser (no custom/external entities)."""
        return DefusedExpatParser()

    def __next__(self):
        # If we have a built RawImportRecord in the buffer, return it.
        if len(self.rawImportRecordBuffer) > 0:
            return self.rawImportRecordBuffer.pop()

        state = BiolectorState()

        for event, node in self.event_stream:
            if event == pulldom.CHARACTERS:
                state.text_add(node.nodeValue)
            elif event == pulldom.START_ELEMENT:
                state.start(node.nodeName)
            elif event == pulldom.END_ELEMENT:
                state.end(node.nodeName)

            # state.collect() returns records if any are ready
            self.rawImportRecordBuffer.extend(state.collect())
            if len(self.rawImportRecordBuffer) > 0:
                return self.rawImportRecordBuffer.pop()

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
        if (
            child.nodeType == child.TEXT_NODE
            or child.nodeType == child.CDATA_SECTION_NODE
        ):
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

    def entity_decl(
        self, name, is_parameter_entity, value, base, sysid, pubid, notation_name
    ):
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
