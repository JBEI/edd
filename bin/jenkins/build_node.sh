#!/bin/bash -xe

# $1 = image tag generated by Jenkins
TAG="${1}"
SERVER="cr.ese.lbl.gov"

DOCKER_BUILDKIT=1 docker build \
    --pull \
    --target edd-node \
    -t "jbei/edd-node:${TAG}" \
    -t "${SERVER}/jbei/edd-node:${TAG}" \
    -f ./docker/edd/core/Dockerfile \
    .
docker push "${SERVER}/jbei/edd-node:${TAG}"
