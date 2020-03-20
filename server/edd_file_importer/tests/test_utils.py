import os
from uuid import UUID

from main.importer.table import ImportBroker

from ..parsers import MeasurementParseRecord
from . import factory

CONTEXT_PATH = "generic_import/FBA-OD-generic.xlsx.cache.context.json"
SERIES_PATH = "generic_import/FBA-OD-generic.xlsx.cache.series.json"


GENERIC_XLS_CREATED_CONTEXT_PATH = os.path.join(
    "generic_import", "FBA-OD-generic.xlsx.cache.context-created.json"
)
GENERIC_XLS_REDIS_SERIES_PATH = os.path.join(
    "generic_import", "FBA-OD-generic.xlsx.cache.series.json"
)


def load_parse_record(json_dict) -> MeasurementParseRecord:
    return MeasurementParseRecord(
        json_dict["loa_name"],
        json_dict["measurement_name"],
        json_dict["format"],
        json_dict["data"],
        json_dict["x_unit_name"],
        json_dict["y_unit_name"],
        tuple(json_dict["src_ids"]),
    )


def clear_import_cache(import_uuid):
    """
    A simple test method decorator that maintains test isolation by clearing Redis and local
    MessageAggregator state associated with the import after the decorated test is completed
    """

    def outer_wrapper(test_method):
        def inner_wrapper(*args):
            try:
                test_method(*args)
            finally:
                redis = ImportBroker()
                redis.clear_context(import_uuid)
                redis.clear_pages(import_uuid)

        return inner_wrapper

    return outer_wrapper


class MsgContent:
    """
    A utility class for specifying an expected notification payload from either a hard-coded
    dict or loaded from a file.
    """

    def __init__(self, msg, payload_dict=None, payload_path=None):
        self.msg = msg
        self.payload_dict = payload_dict
        self._payload_path = payload_path
        self._payload = None

    @property
    def payload(self):
        # if payload is already determined, e.g. by loading a file, just return it
        if self._payload:
            return self._payload

        if self.payload_dict:
            self._payload = self.payload_dict
        if self._payload_path:
            self._payload = self.load_payload_file(self._payload_path)
        return self._payload

    def __str__(self):
        return f"MsgContent({self.msg}, {self.payload})"

    @staticmethod
    def load_payload_file(rel_file_path):
        """
        Loads a WS JSON payload file and converts it to a dict that's comparable in a test
        :param rel_file_path: relative file path from the edd_file_importer/test/files directory
        :return: the payload dict
        """
        abs_file = factory.build_test_file_path(rel_file_path)
        payload_json = factory.load_test_json(abs_file)
        if "uuid" in payload_json:
            payload_json["uuid"] = UUID(payload_json["uuid"])
        return payload_json


class WSTestMixin:
    def _assert_ws_msg(self, ws, msg, payload):
        # loop over the call list, doing a dict-based & order-independent payload comparison
        # to avoid periodic key order problems that still seem to exist in Python 3.7
        for call_ in ws.notify.call_args_list:
            args, kwargs = call_
            if args == (msg,) and kwargs == {
                "tags": ["import-status-update"],
                "payload": payload,
            }:
                return
        self.fail(f"WS notification not found: {msg}, payload={payload}")
