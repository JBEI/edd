#!/bin/bash -xe

# $1 = image tag generated by Jenkins
TAG="${1}"

DOCKER_BUILDKIT=1 docker build \
    --pull \
    --progress plain \
    -t "jbei/edd-node:${TAG}" \
    ./docker/node