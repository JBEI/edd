#!/bin/bash -xe

# $1 = image tag added to jbei/edd-core
IMAGE_VERSION="${1}"
REPO="jenkins.jbei.org:5000"
IMAGE_NAME="jbei/edd-core"

# tag image for registry
docker tag "${IMAGE_NAME}:${IMAGE_VERSION}" "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
# push image to registry
docker push "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
# remove tag locally to allow cleanup
docker image rm "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
