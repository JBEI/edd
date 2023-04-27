#!/usr/bin/env bash

set -eo pipefail

EDD_DIR="$(cd "$(dirname "$(dirname $0)")" && pwd)"

DOCKER_BUILDKIT=1 docker build \
    --pull \
    --build-arg "EDD_VERSION=development" \
    --target edd-node \
    -t jbei/edd-node \
    "${EDD_DIR}"
DOCKER_BUILDKIT=1 docker build \
    --pull \
    --build-arg "EDD_VERSION=development" \
    -t jbei/edd-core \
    "${EDD_DIR}"
