#!/usr/bin/env bash

set -eo pipefail

EDD_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"

cd "${EDD_ROOT}"
DOCKER_BUILDKIT=1 docker build \
    --pull \
    --build-arg "EDD_VERSION=development" \
    --target edd-node \
    -f ./docker/edd/core/Dockerfile \
    -t jbei/edd-node \
    .
DOCKER_BUILDKIT=1 docker build \
    --pull \
    --build-arg "EDD_VERSION=development" \
    -f ./docker/edd/core/Dockerfile \
    -t jbei/edd-core \
    .
