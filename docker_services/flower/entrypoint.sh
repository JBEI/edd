#!/bin/bash

set -o pipefail -e

# Wait for rabbitmq to become available
until nc -z rabbitmq 5672; do
    echo "Waiting for rabbitmq server …"
    sleep 1
done

exec /usr/local/bin/celery --loglevel=info -P gevent flower
