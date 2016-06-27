#!/bin/bash

# Collect static first, worker will complain if favicons are missing
python /code/manage.py collectstatic --noinput

# Wait for postgres to become available
until nc -z postgres 5432; do
    echo "Waiting for postgres server …"
    sleep 1
done

# Test if our database exists; run init script if missing
# TODO: support applying a database dump instead of init.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd
if ! $?; then
    PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
fi

# Wait for solr to become available
until nc -z solr 8983; do
    echo "Waiting for solr server …"
    sleep 1
done

# Run migrations
python /code/manage.py migrate

# Re-index
# TODO: be smarter about when this needs to run
python /code/manage.py edd_index

# Start up the application server
gunicorn -w 4 -b 0.0.0.0:8000 edd.wsgi:application
