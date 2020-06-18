#!/bin/bash -xe

# $1 = project name given to docker stack deploy
PROJECT="${1}"

# instruct script to save all output to container.log
exec &> >(tee -a "container.log")

# find EDD container and dump log files
CONTAINER_ID="$(docker ps -q -f "name=${PROJECT}_http" -f "health=healthy")"
docker logs "${CONTAINER_ID}"
docker exec "${CONTAINER_ID}" cat /var/log/edd/edd.log
