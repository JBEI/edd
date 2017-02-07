#!/bin/bash

set -eo pipefail

function print_help() {
    echo "Creates a backup of a Docker named Volume to a backup.tgz in current directory."
    echo "Usage: $0 volume_name"
}

if [ $# -eq 1 ]; then
    docker run --rm \
        -v "${1}":/backup_src \
        -v $(pwd):/backup_dest \
        buildpack-deps:stretch \
        tar -czf /backup_dest/backup.tgz -C /backup_src .
else
    print_help
fi
