#!/bin/sh

# Based on healthcheck script found at:
# https://github.com/docker-library/healthcheck/blob/master/redis/docker-healthcheck
host="$(hostname -i || echo '127.0.0.1')"
if [ "$(redis-cli -h "$host" ping)" = 'PONG' ]; then
    exit 0
fi

exit 1
