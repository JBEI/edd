#!/usr/bin/env bash

set -eo pipefail

EDD_DIR="$(cd "$(dirname "$(dirname $0)")" && pwd)"

DOCKER_BUILDKIT=1 docker build \
    --pull \
    --target generate-requirements \
    -t edd-deps \
    "${EDD_DIR}"
docker run --rm -itv "${EDD_DIR}:/install" edd-deps /bin/bash -c \
    '\
        export PATH="/root/.local/bin:$PATH" && \
        poetry lock --no-update && \
        poetry export -f requirements.txt -o requirements.txt && \
        poetry export --with dev -f requirements.txt -o requirements.dev.txt && \
        poetry export --only docs -f requirements.txt -o mkdocs.requirements.txt \
    '
