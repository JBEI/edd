#!/bin/bash

set -eo pipefail

echo "This script currently does not work correctly! As far as I can tell, it will successfully"
echo "upgrade the postgres Docker named volume, but the upgraded volume will have no configured"
echo "pg_hba.conf; when EDD attempts to connect, it finds no database (because connection is"
echo "refused), then helpfully drops/re-creates the database. I'm adding the script as a Work In"
echo "Progress. Actual database upgrades should instead do a pg_dump on the old database version,"
echo "and load that dump into a volume for the new database version."
exit 0

function print_help() {
    echo "Upgrades a database in a named Docker volume to later PostgreSQL versions."
    echo "Usage: $0 volume_name start_version upgrade_version"
    echo "    e.g.: $0 pgdata 9.4 9.6"
}

function port_wait() {
    # $1 = port
    until nc -z localhost "$1"; do
        sleep 1
    done
}

PG_DIR="$(cd "$(dirname "$0")"; pwd)"
DOCKER_DIR="$(cd "$(dirname "$PG_DIR")"; pwd)"
if [ $# -eq 3 ]; then
    VOLUME="$1"
    OLD="$2"
    NEW="$3"
    echo "Backing up original volume to $(pwd)/${VOLUME}-${OLD}.tgz"
    $DOCKER_DIR/backup_volume.sh "$VOLUME" \
        && mv "$(pwd)/backup.tgz" "$(pwd)/${VOLUME}-${OLD}.tgz"
    temp_volume=`echo "$(date)" | shasum | cut -c 1-16`
    temp_volume="temp_${temp_volume}"
    docker volume create --name "$temp_volume"
    echo "Starting image for ${OLD} binaries"
    docker run -d \
        --name "upgrade_${OLD}_${temp_volume}" \
        -v "/usr/lib/postgresql/${OLD}" \
        -v "/usr/share/postgresql/${OLD}" \
        "postgres:${OLD}" \
        echo "done"
    echo "Initializing ${NEW} database"
    docker run --rm -d \
            --name "upgrade_${NEW}_${temp_volume}" \
            -v "${temp_volume}:/var/lib/postgresql/data" \
            -p "25432:5432" \
            --env-file "${DOCKER_DIR}/secrets.env" \
            "postgres:${NEW}" \
        && port_wait "25432" \
        && docker stop "upgrade_${NEW}_${temp_volume}"
    echo "Running the upgrade"
    docker run --rm -d \
        -v "${VOLUME}:/var/lib/postgresql/${OLD}/data" \
        -v "${temp_volume}:/var/lib/postgresql/data" \
        --volumes-from "upgrade_${OLD}_${temp_volume}:ro" \
        "postgres:${NEW}" \
        bash -c "cd /tmp && \
            gosu postgres pg_upgrade \
                -b /usr/lib/postgresql/${OLD}/bin/ \
                -B /usr/lib/postgresql/${NEW}/bin/ \
                -d /var/lib/postgresql/${OLD}/data/ \
                -D /var/lib/postgresql/data/"
    docker rm "upgrade_${OLD}_${temp_volume}"
    echo "Backing up upgraded volume to $(pwd)/${VOLUME}-${NEW}.tgz"
    $DOCKER_DIR/backup_volume.sh "$temp_volume" \
        && mv "$(pwd)/backup.tgz" "$(pwd)/${VOLUME}-${NEW}.tgz"
    echo "Restoring upgraded volume to original volume"
    $DOCKER_DIR/restore_volume.sh "$(pwd)/${VOLUME}-${NEW}.tgz" "$VOLUME"
    echo "Removing temporary upgrade volume"
    docker volume rm "$temp_volume"
else
    print_help
    exit 0
fi
