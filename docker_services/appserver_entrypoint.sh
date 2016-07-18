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
if [ ! -z $POSTGRES_DUMP_URL ] || ([ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]); then
    REINDEX_EDD=true
    psql -h postgres -U postgres -c 'DROP DATABASE IF EXISTS edd;'
    psql -h postgres -U postgres -c 'CREATE DATABASE edd;'  # must be separate commands! Psql
    # complains! 'ERROR:  DROP DATABASE cannot be executed from a function or multi-command string'
# Test if our database exists; run init script if missing
elif ! psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd; then
    echo "Initializing the database for first-time use ..."
    REINDEX_EDD=true
    psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
fi

# If database dump URL is provided, dump the reference database and restore the local one from
# the dump
if [ ! -z $POSTGRES_DUMP_URL ]; then
    echo "Copying database from remote $POSTGRES_DUMP_URL ..." # TODO: blank out password
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

# without running them, figure out how many migrations are needed by grepping django command output
# for unchecked boxes, e.g. ' [ ]'. We can run no-op migrations with impunity, but this way we're
# printing output that's consistent with the logic below, which also controls whether the Solr index
# gets rebuilt
#MIGRATIONS_NEEDED=0
#MIGRATIONS_NEEDED=$(python /code/manage.py showmigrations --list | grep --perl-regexp
# '\s+\[\s+\].*' | wc -l)
#MIGRATIONS_NEEDED=`python /code/manage.py showmigrations --list | grep --perl-regexp '\s+\[\s+\]
# .*' | wc -l`
#MIGRATIONS_NEEDED=$(python /code/manage.py showmigrations --list | \
#    grep --perl-regexp '\s+\[\s+\].*' | \
#    wc -l)
# echo "$MIGRATIONS_NEEDED migrations needed. TODO: remove debug stmt"

MIGRATIONS_NEEDED=1 # short-circuit commented-out logic above for detecting the number of
# migrations. Works on the command line after the appserver is started, but fails when attempted
# during container start. hmmm... TODO: consider implementing/testing other patterns that detect #
# of applied migrations by just always running them -- though presently unclear whether that will
# fare any better. Need to prevent re-indexing when migrations weren't run.

# if needed, run migrations and rebuild the Solr index
if [ $MIGRATIONS_NEEDED -gt 0 ]; then
    echo "Running migrations..."
    REINDEX_EDD=true
    python /code/manage.py migrate
    echo
    echo "End of database migrations"
else
    echo "No pending database migrations."
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

