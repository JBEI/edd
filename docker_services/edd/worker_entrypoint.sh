#!/bin/bash

set -o pipefail -e

# Wait for redis to become available
until nc -z redis 6379; do
    echo "Waiting for redis server …"
    sleep 1
done

# Wait for postgres to become available
until nc -z postgres 5432; do
    echo "Waiting for postgres server …"
    sleep 1
done

# Wait for solr to become available
until nc -z solr 8983; do
    echo "Waiting for solr server …"
    sleep 1
done

# Wait for rabbitmq to become available
until nc -z rabbitmq 5672; do
    echo "Waiting for rabbitmq server …"
    sleep 1
done

# Start the worker
celery -A edd worker -l info
