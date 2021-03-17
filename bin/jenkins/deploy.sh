#!/bin/bash -xe

# including --force because the image will be same name
# e.g. jbei/edd-core:trunk
# and may not actually update because "nothing changed"
docker service update \
    --with-registry-auth \
    --image "${1}" \
    --force \
    edd-test_http
docker service update \
    --with-registry-auth \
    --image "${1}" \
    --force \
    edd-test_worker
docker service update \
    --with-registry-auth \
    --image "${1}" \
    --force \
    edd-test_websocket
