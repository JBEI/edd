#!/bin/bash -xe

# $1 = project name

docker-compose -p "${1}" down
docker ps -qf 'name=${1}_*' | xargs docker rm || true
docker network ls -qf 'name=${1}_*' | xargs docker network rm || true
docker volume ls -qf 'name=${1}_*' | xargs docker volume rm || true
