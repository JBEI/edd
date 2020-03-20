import json

import environ


def build_test_file_path(*args):
    """
    Gets the absolute path of the test file specified by args.

    :param args: one or more directories relative to the
        edd_file_importer/tests/files directory
    :return: the absolute path
    """
    cwd = environ.Path(__file__) - 1
    return cwd("files", *args)


def load_test_file(name, mode="rb"):
    """Opens test files saved in the `files` directory."""
    filepath = build_test_file_path(name)
    return open(filepath, mode)


def load_test_json(name, mode="rb"):
    filepath = build_test_file_path(name)
    with open(filepath, mode) as fp:
        return json.loads(fp.read())
