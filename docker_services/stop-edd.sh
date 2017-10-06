#!/usr/bin/env bash

set -eo pipefail

# Follow links until at the true script location
SELF="$0"
while [ -h "$SELF" ]; do
    list="$(ls -ld "$SELF")"
    target="$(expr "$list" : '.*-> \(.*\)$')"
    if expr "$target" : '/.*' > /dev/null; then
        SELF="$target"
    else
        SELF="$(dirname "$SELF")/$target"
    fi
done
# get full path to directory by switching to it and using pwd
SELFDIR="$(cd "$(dirname "$SELF")"; pwd)"
cd "$SELFDIR"

docker-compose down
