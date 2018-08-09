# coding: utf-8
import environ
import json


def test_file_path(*args):
    cwd = environ.Path(__file__) - 1
    return cwd('files', *args)


def load_test_file(name, mode='rb'):
    """ Opens test files saved in the `files` directory. """
    filepath = test_file_path(name)
    return open(filepath, mode)


def load_test_json(name, mode='rb'):
    filepath = test_file_path(name)
    with open(filepath, mode) as fp:
        return json.loads(fp.read())


def main_test_file_path(*args):
    project_root_dir = environ.Path(__file__) - 3
    rel_path = ['main', 'tests', 'files']
    rel_path.extend(args)
    return project_root_dir(*rel_path)
