#!/bin/bash -xe

# $1 = project name given to docker stack deploy
PROJECT="${1}"

# instruct script to save all output to test.log
exec &> >(tee -a "test.log")

# find EDD container
CONTAINER_ID="$(docker ps -q -f "name=${PROJECT}_http" -f "health=healthy")"

# run tests
docker exec "${CONTAINER_ID}" \
    /usr/local/bin/run_tests.sh
