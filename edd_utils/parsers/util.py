# coding: utf-8

import copy


class RawImportRecord(object):
    """
    A "raw" record for measurement import, suitable for passing to Step 2 of the EDD Data Table
    Import page. Think of it as a crude form of an Assay (only one measurement type allowed, and
    its value array). It provides a series of data points, and places for strings meant to be
    resolved into record identifiers (by Step 4 in the front end for example) such as Line/Assay,
    Measurement (name of General/Metabolite/Gene/etc), and Metadata names/values. The import page
    submits a complementary data structure back to the server, including the original fields but
    also resolving the ambiguous strings to primary keys of real records.  The server uses both
    structures to finalize the submission. (In some situations - like small tab/csv documents -
    the parsing is all done client-side, and in that case the client does not receive any original
    RawImportRecords from the server.) The eventual goal is to standardize part of the data import
    pipeline across different sources and/or document types. (It may be necessary to subclass
    RawImportRecord if a given data source needs to transmit additional fields.)
    """

    def __init__(self, kind="std", name="NoName", line_name=None, assay_name=None, data=[],
                 metadataName={}):
        self.kind = kind
        self.assay_name = assay_name
        self.line_name = line_name
        self.measurement_name = name
        self.metadata_by_name = copy.deepcopy(metadataName)
        self.data = copy.deepcopy(data)

    def __repr__(self):
        return "<%s RawImportRecord '%s', A:'%s', %s data points>" % (
            self.kind, self.measurement_name, self.assay_name, len(self.data))

    def to_json(self, depth=0):
        return {
            "kind": self.kind,
            "line_name": self.line_name,
            "assay_name": self.assay_name,
            "measurement_name": self.measurement_name,
            "metadata_by_name": self.metadata_by_name,
            "data": self.data,
        }
