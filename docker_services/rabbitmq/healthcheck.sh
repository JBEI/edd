#!/bin/bash

# Based on healthcheck script found at:
# https://github.com/docker-library/healthcheck/blob/master/rabbitmq/docker-healthcheck

set -eo pipefail

host="$(hostname --short || echo 'localhost')"
export RABBITMQ_NODENAME="${RABBITMQ_NODENAME:-rabbit@$host}"

if rabbitmqctl status; then
    exit 0
fi

exit 1
