#!/bin/bash -xe

# $1 = project name given to docker stack deploy
PROJECT="${1}"

# instruct script to save all output to test.log
exec &> >(tee -a "test.log")

# find EDD container
CONTAINER_ID="$(docker-compose -p "${PROJECT}" -f combined.yml ps -q edd)"

# run tests
docker exec "${CONTAINER_ID}" \
    coverage run --branch --source=. manage.py test --exclude-tag=known-broken

# report on coverage
docker exec "${CONTAINER_ID}" coverage report -m --skip-covered
