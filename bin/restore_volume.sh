#!/bin/bash

set -eo pipefail

function print_help() {
    echo "Restores a backup of a Docker named Volume."
    echo "Usage: $0 backup_file volume_name"
}

if [ $# -eq 2 ]; then
    BACKUP="$(cd "$(dirname "$1")"; pwd)/$(basename "$1")"
    VOLUME="$2"
    docker run --rm \
        -v "$VOLUME":/backup_dest \
        library/alpine:3.9 \
        rm -rf /backup_dest/*
    docker run --rm \
        -v "$BACKUP":/backup_src/backup.tgz \
        -v "$VOLUME":/backup_dest \
        library/alpine:3.9 \
        tar -xzf /backup_src/backup.tgz -C /backup_dest
else
    print_help
fi
