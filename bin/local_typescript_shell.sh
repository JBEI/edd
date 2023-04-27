#!/usr/bin/env bash

set -eo pipefail

EDD_ROOT="$(cd "$(dirname "$0")"; cd ..; pwd)"

echo 'To build TypeScript for local development:'
echo '  1. run `npm run local` OR `npm run watch` here;'
echo '  2. have development EDD running, with source mounted to `/code`;'
echo '  3. inside the EDD container, run `refresh_static.sh` after every rebuild;'

docker run --rm -it \
    -v "${EDD_ROOT}/server/main/static/dist:/run/dist" \
    -v "${EDD_ROOT}/typescript:/run/typescript" \
    -v "${EDD_ROOT}/.prettierrc.js:/run/.prettierrc.js" \
    jbei/edd-node:latest
