#!/bin/bash

# Based on healthcheck script found at:
# https://github.com/docker-library/healthcheck/blob/master/postgres/docker-healthcheck

set -eo pipefail

# file_env copied from postgres docker-entrypoint.sh
# usage: file_env VAR [DEFAULT]
#    ie: file_env 'XYZ_DB_PASSWORD' 'example'
# (will allow for "$XYZ_DB_PASSWORD_FILE" to fill in the value of
#  "$XYZ_DB_PASSWORD" from a file, especially for Docker's secrets feature)
function file_env() {
    local var="$1"
    local fileVar="${var}_FILE"
    local def="${2:-}"
    if [ "${!var:-}" ] && [ "${!fileVar:-}" ]; then
        echo >&2 "error: both $var and $fileVar are set (but are exclusive)"
        exit 1
    fi
    local val="$def"
    if [ "${!var:-}" ]; then
        val="${!var}"
    elif [ "${!fileVar:-}" ]; then
        val="$(< "${!fileVar}")"
    fi
    export "$var"="$val"
}

host="127.0.0.1"
user="${POSTGRES_USER:-postgres}"
file_env 'POSTGRES_PASSWORD'
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

args=(
    --host "$host"
    --username "$user"
    --no-password
    --command "SELECT 1"
    --quiet
    --no-align
    --tuples-only
)

if select="$(psql "${args[@]}")" && [ "$select" = '1' ]; then
    exit 0
fi

exit 1
