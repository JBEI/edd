#!/bin/bash -xe

# $1 = stack name given to docker

# remove stack
docker stack rm "${1}"

# remove configs and secrets created in launch.sh
docker config ls -qf "name=${1}_" | xargs --no-run-if-empty docker config rm
docker secret ls -qf "name=${1}_" | xargs --no-run-if-empty docker secret rm
