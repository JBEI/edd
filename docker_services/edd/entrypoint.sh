#!/bin/bash

set -o pipefail -e

QUIET=0
SEPARATOR='************************************************************************'
function output() {
    if [ ! $QUIET -eq 1 ]; then
        echo "$@"
    fi
}

function banner() {
    output
    output "$SEPARATOR"
    output "$1"
    output "$SEPARATOR"
}

function service_wait() {
    # $1 = service name
    # $2 = service port
    until nc -z "$1" "$2"; do
        output "Waiting for $1 service …"
        sleep 1
    done
}

function ping_wait() {
    # Redis may accept connections but not be ready to serve
    # This function instead simulates redis-cli PING command and checks for PONG
    until [ "$(echo 'ping' | nc -w 1 "$1" "$2" | tr -d '[:space:]')" = "+PONG" ]; do
        output "Waiting for $1 service …"
        sleep 1
    done
}

function print_help() {
    echo "Usage: entrypoint.sh [options] [--] command [arguments]"
    echo "Options:"
    echo "    -h, --help"
    echo "        Print this help message."
    echo "    -q, --quiet"
    echo "        Silence output from this entrypoint script."
    echo "    -a, --init, --init-all"
    echo "        Perform all initialization tasks prior to command start (default)."
    echo "    -A, --no-init, --no-init-all"
    echo "        Skip all initialization tasks; may override with another --init* flag."
    echo "    -s, --init-static"
    echo "        Copy static files to the static volume. Only used to override -A."
    echo "    -S, --no-init-static"
    echo "        Skip initialization of static files."
    echo "    -d, --init-database"
    echo "        Initialize the database using POSTGRES_DUMP_URL or POSTGRES_DUMP_FILE"
    echo "        environment. Only used to override -A."
    echo "    -D, --no-init-database"
    echo "        Skip initialization of the database."
    echo "    -m, --init-migration"
    echo "        Run any pending database migrations. Only used to override -A."
    echo "    -M, --no-init-migration"
    echo "        Skip database migrations."
    echo "    -i, --init-index"
    echo "        Re-index search prior to command. Only used to override -A."
    echo "    -I, --no-init-index"
    echo "        Skip search re-indexing."
    echo "    --local file"
    echo "        Copy the file specified to the local.py settings prior to launching the"
    echo "        command. This option will be ignored if code is mounted to the container"
    echo "        at /code."
    echo "    --force-index"
    echo "        Force re-indexing; this option does not apply if -I is set."
    echo "    -w host, --wait-host host"
    echo "        Wait for a host to begin responding before running commands. This option"
    echo "        may be specified multiple times. The waits will occur in the"
    echo "        order encountered."
    echo "    -p port, --wait-port port"
    echo "        Only applies if -w is used. Specifies port to listen on. Defaults to"
    echo "        port 24051. This option may be specified multiple times. The Nth port"
    echo "        defined applies to the Nth host."
    echo "    --watch-static"
    echo "        Watch for changes to static files, to copy to the static volume."
    echo
    echo "Commands:"
    echo "    application"
    echo "        Start a Django webserver (gunicorn)."
    echo "    devmode"
    echo "        Start a Django webserver (manage.py runserver)."
    echo "    init-only [port]"
    echo "        Container will only perform selected init tasks. The service will begin"
    echo "        listening on the specified port after init, default to port 24051."
    echo "    init-exit"
    echo "        Container will only perform selected init tasks, then exit."
    echo "    test"
    echo "        Execute the EDD unit tests."
    echo "    worker"
    echo "        Start a Celery worker node."
}

short="adhimp:qsw:ADIMS"
long="help,quiet,init,init-all,no-init,no-init-all"
long="$long,init-static,no-init-static,init-database,no-init-database"
long="$long,init-migration,no-init-migration,init-index,no-init-index"
long="$long,local:,force-index,wait-host:,wait-port:,watch-static"
params=`getopt -o "$short" -l "$long" --name "$0" -- "$@"`
eval set -- "$params"

COMMAND=shell
INIT_STATIC=1
INIT_DB=1
INIT_MIGRATE=1
INIT_INDEX=1
REINDEX_EDD=false
WAIT_HOST=()
WAIT_PORT=()
WATCH_STATIC=false

while [ ! $# -eq 0 ]; do
    case "$1" in
        --help | -h)
            print_help
            exit 0
            ;;
        --quiet | -q)
            shift
            QUIET=1
            ;;
        --init-all | --init | -a)
            shift
            INIT_STATIC=1
            INIT_DB=1
            INIT_MIGRATE=1
            INIT_INDEX=1
            ;;
        --no-init-all | --no-init | -A)
            shift
            INIT_STATIC=0
            INIT_DB=0
            INIT_MIGRATE=0
            INIT_INDEX=0
            ;;
        --init-static | -s)
            shift
            INIT_STATIC=1
            ;;
        --no-init-static | -S)
            shift
            INIT_STATIC=0
            ;;
        --init-database | -d)
            shift
            INIT_DB=1
            ;;
        --no-init-database | -D)
            shift
            INIT_DB=0
            ;;
        --init-migration | -m)
            shift
            INIT_MIGRATE=1
            ;;
        --no-init-migration | -M)
            shift
            INIT_MIGRATE=0
            ;;
        --init-index | -i)
            shift
            INIT_INDEX=1
            ;;
        --no-init-index | -I)
            shift
            INIT_INDEX=0
            ;;
        --local)
            LOCAL_PY="$2"
            shift 2
            ;;
        --force-index)
            shift
            REINDEX_EDD=true
            ;;
        --wait-host | -w)
            WAIT_HOST+=("$2")
            shift 2
            ;;
        --wait-port | -p)
            WAIT_PORT+=("$2")
            shift 2
            ;;
        --watch-static)
            shift
            WATCH_STATIC=true
            ;;
        --)
            shift
            if [ ! $# -eq 0 ]; then
                COMMAND="$1"
                shift
            else
                echo "No command specified" >&2
                exit 1
            fi
            break
            ;;
        -*)
            echo "Unknown flag $1" >&2
            exit 1
            ;;
        *)
            COMMAND="$1"
            shift
            break
            ;;
    esac
done

# Check for required environment!
if [ -z "${EDD_USER}" ]; then
    (>&2 echo "No EDD_USER environment set; did you run init-config.sh before launching Docker?")
    exit 1
elif [ -z "${EDD_EMAIL}" ]; then
    (>&2 echo "No EDD_EMAIL environment set; did you run init-config.sh before launching Docker?")
    exit 1
fi

output "EDD_DEPLOYMENT_ENVIRONMENT:" \
    "${EDD_DEPLOYMENT_ENVIRONMENT:-'Not specified. Assuming PRODUCTION.'}"
# Look for code mounted at /code and symlink to /usr/local/edd if none found
if [ ! -x /code/manage.py ]; then
    output "Running with container copy of code …"
    # first get rid of auto-created /code directory
    cd / && rmdir /code
    # then link the container copy of code to /code
    ln -s /usr/local/edd /code
    # and go back into /code
    cd /code
    if [ ! -z "$LOCAL_PY" ]; then
        cp "$LOCAL_PY" /code/edd/settings/local.py
    fi
else
    output "Running with mounted copy of code …"
fi
if [ ! -f /code/edd/settings/local.py ]; then
    output "Creating local.py from example …"
    cp /code/edd/settings/local.py-example /code/edd/settings/local.py
    sed -i.bak -e "s/'Jay Bay'/'${EDD_USER}'/;s/'admin@example.org'/'${EDD_EMAIL}'/" \
        /code/edd/settings/local.py
    rm /code/edd/settings/local.py.bak
fi
cd /code
export EDD_VERSION_HASH="$(git -C /code rev-parse --short HEAD)"

# If specified, wait on other service(s)
for ((i=0; i<${#WAIT_HOST[@]}; i++)); do
    port=${WAIT_PORT[$i]:-24051}
    service_wait "${WAIT_HOST[$i]}" $port
done

# Wait for redis to become available
ping_wait redis 6379

if [ $INIT_STATIC -eq 1 ]; then
    banner "Collecting static resources …"
    # Collect static first, worker will complain if favicons are missing
    python /code/manage.py collectstatic --noinput
fi
if [ "$WATCH_STATIC" = "true" ]; then
    output "Watching for static resource changes …"
    python /code/manage.py edd_collectstatic --watch &
fi

# Wait for postgres to become available
service_wait postgres 5432

if [ $INIT_DB -eq 1 ]; then
    banner "Configuring database initial state …"

    export PGPASSWORD=$POSTGRES_PASSWORD
    # Test if our database exists; run init script if missing
    if ! psql -lqt -h postgres -U postgres | cut -d \| -f 1 | grep -qw edd; then
        output "Initializing the database for first-time use …"
        psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql
        # Flag for re-indexing
        REINDEX_EDD=true
        DATABASE_CREATED=true
    fi
    if [ ! -z $POSTGRES_DUMP_URL ] || \
            ([ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]); then
        # Don't bother dropping and recreating if database just initialized
        if [ "$DATABASE_CREATED" != "true" ]; then
            echo 'DROP DATABASE IF EXISTS edd; CREATE DATABASE edd;' | \
                psql -h postgres -U postgres
        fi
        # Flag for re-indexing
        REINDEX_EDD=true
    fi

    # If database dump URL is provided, dump the reference database and restore the local one from
    # the dump
    if [ ! -z $POSTGRES_DUMP_URL ]; then
        output $(echo "Copying database from remote $POSTGRES_DUMP_URL …" | \
                sed -E -e 's/(\w+):\/\/([^:]+):[^@]*@/\1:\/\/\2:****@/')
        pg_dump "$POSTGRES_DUMP_URL" | psql -h postgres -U postgres edd
    elif [ ! -z $POSTGRES_DUMP_FILE ] && [ -r $POSTGRES_DUMP_FILE ]; then
        output "Copying database from local file $POSTGRES_DUMP_FILE …"
        psql -h postgres -U postgres edd < "$POSTGRES_DUMP_FILE"
    else
        output "Skipping database restore. No dump source specified."
    fi
fi

unset PGPASSWORD
unset POSTGRES_DUMP_FILE
unset POSTGRES_DUMP_URL

# Wait for solr to become available
service_wait solr 8983

if [ $INIT_MIGRATE -eq 1 ]; then
    banner "Managing database migrations …"

    # Temporarily turn off strict error checking, as the migration check will sometimes
    # have a non-zero exit
    set +e

    # List any pending migrations
    MIGRATIONS=$(python /code/manage.py showmigrations --plan 2> /dev/null | grep -v '[X]')

    # Re-enable strict error checking
    set -e

    # Run migrations; if any detected, flag for re-indexing
    if [ ! -z "$MIGRATIONS" ]; then
        output "Detected pending migrations …"
        python /code/manage.py migrate
        REINDEX_EDD=true
    fi
fi

if [ $INIT_INDEX -eq 1 ]; then
    banner "Re-building Solr indexes …"

    if [ "$REINDEX_EDD" = "true" ]; then
        output
        python /code/manage.py edd_index
        output "End of Solr index rebuild"
    else
        output "Skipping Solr index rebuild since there were" \
            "no applied database migrations or restores from dump"
    fi
fi

# Wait for rabbitmq to become available
service_wait rabbitmq 5672

# Start up the command
case "$COMMAND" in
    application)
        banner "Starting production appserver"
        exec gunicorn -w 4 -b 0.0.0.0:8000 edd.wsgi:application
        ;;
    devmode)
        banner "Starting development appserver"
        exec python manage.py runserver 0.0.0.0:8000
        ;;
    init-only)
        output "Init finished"
        mkdir -p /tmp/edd-wait
        cd /tmp/edd-wait
        exec python -m SimpleHTTPServer ${1:-24051}
        ;;
    init-exit)
        output "Init finished"
        ;;
    test)
        banner "Running tests"
        exec python manage.py test
        ;;
    worker)
        banner "Starting Celery worker"
        exec celery -A edd worker -l info
        ;;
    daphne)
        banner "Starting daphne"
        exec daphne -b 0.0.0.0 -p 8000 edd.asgi:channel_layer
        ;;
    websocket)
        banner "Starting WebSocket worker"
        exec python manage.py runworker --threads 6
        ;;
    *)
        output "Unrecognized command: $COMMAND"
        exit 1
        ;;
esac
