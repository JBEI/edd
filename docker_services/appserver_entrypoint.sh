#!/bin/bash

set -o pipefail -e

SEPARATOR='****************************************************************************************'
REINDEX_EDD=false
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
echo "Configuring database initial state..."
echo "$SEPARATOR"
# Wait for postgres to become available
until nc -z postgres 5432; do
    echo "Waiting for postgres server ..."
    sleep 1
done

export PGPASSWORD=$POSTGRES_PASSWORD
# Test if our database exists; run init script if missing
if ! psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd; then
    echo "Initializing the database for first-time use ..."
    psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
    # Flag for re-indexing
    REINDEX_EDD=true
fi
if [ ! -z $POSTGRES_DUMP_URL ] || ([ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]); then
    # Don't bother dropping and recreating if database just initialized
    if [ "$REINDEX_EDD" != "true" ]; then
        echo 'DROP DATABASE IF EXISTS edd; CREATE DATABASE edd;' | psql -h postgres -U postgres
    fi
    # Flag for re-indexing
    REINDEX_EDD=true
fi

# If database dump URL is provided, dump the reference database and restore the local one from
# the dump
if [ ! -z $POSTGRES_DUMP_URL ]; then
    echo "Copying database from remote $POSTGRES_DUMP_URL ..." | \
        sed -E -e 's/(\w+):\/\/([^:]+):[^@]*@/\1:\/\/\2:****@/'
    REINDEX_EDD=true
    pg_dump "$POSTGRES_DUMP_URL" | psql -h postgres -U postgres edd
elif [ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]; then
    echo "Copying database from local file $POSTGRES_DUMP_FILE ..."
    REINDEX_EDD=true
    psql -h postgres -U postgres edd < "$POSTGRES_DUMP_FILE"
else
    echo "Skipping database restore. No dump source specified."
fi
unset PGPASSWORD
unset POSTGRES_DUMP_FILE
unset POSTGRES_DUMP_URL

# Wait for solr to become available
until nc -z solr 8983; do
    echo "Waiting for solr server..."
    sleep 1
done

echo
echo "$SEPARATOR"
echo "Running database migrations..."
echo "$SEPARATOR"

# Temporarily turn off strict error checking, as the migration check will sometimes
# have a non-zero exit
set +e

# List any pending migrations
MIGRATIONS=$(python /code/manage.py showmigrations --plan 2> /dev/null | grep -v '[X]')

# Re-enable strict error checking
set -e

# Run migrations; if any detected, flag for re-indexing
python /code/manage.py migrate
if [ ! -z "$MIGRATIONS" ]; then
    echo "Detected pending migrations..."
    REINDEX_EDD=true
fi

echo
echo "$SEPARATOR"
echo "Re-building Solr indexes..."
echo "$SEPARATOR"

if [ "$REINDEX_EDD" = "true" ]; then
    echo
    python /code/manage.py edd_index
    echo "End of Solr index rebuild"
else
    echo "Skipping Solr index rebuild since there were no database migrations or restores from dump"
fi

# Start up the application server
echo
echo "$SEPARATOR"
if [ "$EDD_DEPLOYMENT_ENVIRONMENT" = "DEVELOPMENT" ]; then
    echo "Starting development apppserver"
    echo "$SEPARATOR"
    python manage.py runserver 0.0.0.0:8000
else
    echo "Starting production appserver"
    echo "$SEPARATOR"
    gunicorn -w 4 -b 0.0.0.0:8000 edd.wsgi:application
fi

