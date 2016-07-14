#!/bin/bash

set -o pipefail -e

SEPARATOR='****************************************************************************************'
echo "EDD_DEPLOYMENT_ENVIRONMENT: " ${EDD_DEPLOYMENT_ENVIRONMENT:-'Not specified. Assuming PRODUCTION.'}

# TODO: check for $EDD_HOST_DIR; if found, proceed
#   if $EDD_HOST_DIR not found, test for contents of /code
#   if /code does not contain EDD code, run git clone

# Wait for redis to become available
until nc -z redis 6379; do
    echo "Waiting for redis server …"
    sleep 1
done

echo
echo "$SEPARATOR"
echo "Collecting static resources..."
echo "$SEPARATOR"
# Collect static first, worker will complain if favicons are missing
python /code/manage.py collectstatic --noinput

echo
echo "$SEPARATOR"
echo "Configuring database and Solr indexes..."
echo "$SEPARATOR"
# Wait for postgres to become available
until nc -z postgres 5432; do
    echo "Waiting for postgres server …"
    sleep 1
done

# Test if our database exists; run init script if missing
export PGPASSWORD=$POSTGRES_PASSWORD
if ! psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd; then
    echo "$SEPARATOR"
    echo "Initializing the database for first-time use …"
    psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
fi

# if new data is provided, drop and re-create the existing database to prepare for receiving the
# dump
if [ ! -z $POSTGRES_DUMP_URL ] || ([ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]); then
    echo "Dropping existing database edd"
    psql -h postgres -U postgres -c 'DROP DATABASE IF EXISTS edd;'
    psql -h postgres -U postgres -c 'CREATE DATABASE edd;'
fi

# If database dump URL is provided, dump the reference database and restore the local one from
# the dump
if [ ! -z $POSTGRES_DUMP_URL ]; then
    echo "Copying database from remote $POSTGRES_DUMP_URL …"
    pg_dump "$POSTGRES_DUMP_URL" | psql -h postgres -U postgres edd
elif [ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]; then
    echo "Copying database from local file $POSTGRES_DUMP_FILE …"
    psql -h postgres -U postgres edd < "$POSTGRES_DUMP_FILE"
else
    echo "Skipping database restore"
fi
unset PGPASSWORD
unset POSTGRES_DUMP_FILE
unset POSTGRES_DUMP_URL

# Wait for solr to become available
until nc -z solr 8983; do
    echo "Waiting for solr server …"
    sleep 1
done

echo
echo "$SEPARATOR"
echo "Running database migrations..."
echo "$SEPARATOR"
python /code/manage.py migrate


if [ ! -z $POSTGRES_DUMP_URL ] || ([ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]); then
    echo "$SEPARATOR"
    echo "Re-building Solr indexes..."
    python /code/manage.py edd_index
fi

# Start up the application server
echo
echo "$SEPARATOR"
if [ "$EDD_DEPLOYMENT_ENVIRONMENT" ==  "DEVELOPMENT" ]; then
    echo "Starting development apppserver"
    echo "$SEPARATOR"
    python manage.py runserver 0.0.0.0:8000
else
    echo "Starting production appserver"
    echo "$SEPARATOR"
    gunicorn -w 4 -b 0.0.0.0:8000 edd.wsgi:application
fi

unset EDD_DEPLOYMENT_ENVIRONMENT

