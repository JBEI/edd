#!/bin/bash

# Based on healthcheck script found at:
# https://github.com/docker-library/healthcheck/blob/master/postgres/docker-healthcheck

set -eo pipefail

host="$(hostname --ip-address || echo '127.0.0.1')"
user="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

args=(
    --host "$host"
    --username "$user"
    --command "SELECT 1"
    --quiet --no-align --tuples-only
)

if select="$(psql "${args[@]}")" && [ "$select" = '1' ]; then
    exit 0
fi

exit 1
