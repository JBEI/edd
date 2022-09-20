#!/usr/bin/env bash

set -euo pipefail

{
    docker run --rm \
        "cr.ese.lbl.gov/jbei/edd-node:${ESE_BUILD_TAG}" \
        yarn test
} &> >(tee -a "test.log")
