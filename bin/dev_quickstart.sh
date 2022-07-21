#!/usr/bin/env bash

set -eo pipefail

EDD_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"

echo 'Setting up quickstart environment'
cd "${EDD_ROOT}/docker/edd/config"
DOCKER_BUILDKIT=1 docker build -t jbei/edd-config .
cd "${EDD_ROOT}"
echo 'Creating initial configration scripts'
bin/init-config offline --deploy=dev
echo 'Creating default (dev-only!) settings'
cp settings/example settings/__init__.py
