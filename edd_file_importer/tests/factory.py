# coding: utf-8
import environ


def test_file_path(name):
    cwd = environ.Path(__file__) - 1
    return cwd('files', name)


def load_test_file(name, mode='rb'):
    """ Opens test files saved in the `files` directory. """
    filepath = test_file_path(name)
    return open(filepath, mode)
