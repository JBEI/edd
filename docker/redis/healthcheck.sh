#!/bin/bash

# Based on healthcheck script found at:
# https://github.com/docker-library/healthcheck/blob/master/redis/docker-healthcheck

set -eo pipefail

host="$(hostname --ip-address || echo '127.0.0.1')"

if ping="$(redis-cli -h "$host" ping)" && [ "$ping" = 'PONG' ]; then
    exit 0
fi

exit 1
