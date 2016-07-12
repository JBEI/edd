#!/bin/bash

set -o pipefail -e

# TODO: check for $EDD_HOST_DIR; if found, proceed
#   if $EDD_HOST_DIR not found, test for contents of /code
#   if /code does not contain EDD code, run git clone

# Wait for redis to become available
until nc -z redis 6379; do
    echo "Waiting for redis server …"
    sleep 1
done

# Collect static first, worker will complain if favicons are missing
python /code/manage.py collectstatic --noinput

# Wait for postgres to become available
until nc -z postgres 5432; do
    echo "Waiting for postgres server …"
    sleep 1
done

# Test if our database exists; run init script if missing
export PGPASSWORD=$POSTGRES_PASSWORD
if ! psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd; then
    echo "Initializing the database for first-time use …"
    psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
fi
# If database dump URL is provided, dump and restore database
if [ ! -z $POSTGRES_DUMP_URL ]; then
    echo "Copying database from remote $POSTGRES_DUMP_URL …"
    pg_dump "$POSTGRES_DUMP_URL" | psql -h postgres -U postgres edd
elif [ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]; then
    echo "Copying database from local file $POSTGRES_DUMP_FILE …"
    psql -h postgres -U posgtres edd < "$POSTGRES_DUMP_FILE"
else
    echo "Skipping database restore …"
fi
unset PGPASSWORD
unset POSTGRES_DUMP_FILE
unset POSTGRES_DUMP_URL

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
