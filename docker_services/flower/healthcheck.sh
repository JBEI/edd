#!/bin/bash

set -eo pipefail

host="$(hostname --ip-address || echo '127.0.0.1')"

if curl --fail -LSsu "${FLOWER_BASIC_AUTH}" "http://${host}:5555/" > /dev/null; then
    exit 0
fi

exit 1
