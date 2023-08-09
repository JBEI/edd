#!/bin/bash

set -euxo pipefail

# run tests -- always with debug disabled
EDD_DEBUG=false && {
  # reuse database for efficiency
  coverage run -m pytest --reuse-db || \
  # some async tests fail under load, re-run these to be sure
  coverage run --append -m pytest --reuse-db --last-failed
}

# print report of coverage
coverage report -m --skip-covered

# save JSON for code highlighting
coverage json
