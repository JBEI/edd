#!/bin/bash

set -euxo pipefail

# run tests
coverage run -m pytest

# print report of coverage
coverage report -m --skip-covered

# save JSON for code highlighting
coverage json
