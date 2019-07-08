#!/bin/bash

set -eo pipefail

# if container is attached to multiple networks, there can be multiple IP addresses
host="$(hostname --ip-address | cut -d' ' -f 1)"
# TODO: allow configuring timeout on individual core pings
failed_cores=0

if curl --fail -LSs "http://${host:-127.0.0.1}:8983/" > /dev/null; then
    find /opt/solr/server/solr -name "core.properties" | \
        cut -d/ -f 6 | \
        while read core; do
            url="http://${host:-127.0.0.1}:8983/solr/${core}/admin/ping"
            if ! curl --fail -Ss -m 2 "$url" > /dev/null; then
                echo "Failed to ping ${core} in 2 seconds"
                ((failed_cores++))
            fi
        done
        if (( failed_cores == 0 )); then
            exit 0
        fi
fi

exit 1
