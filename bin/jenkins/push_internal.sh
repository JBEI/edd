#!/bin/bash -xe

# $1 = image tag added to jbei/edd-core
# $2 = branch tag added to jbei/edd-core
IMAGE_VERSION="${1}"
BRANCH="${2}"
REPO="cr.ese.lbl.gov"
IMAGE_NAME="jbei/edd-core"

# tag image for registry
docker tag "${IMAGE_NAME}:${IMAGE_VERSION}" "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
docker tag "${IMAGE_NAME}:${IMAGE_VERSION}" "${REPO}/${IMAGE_NAME}:${BRANCH}"
# push image to registry
docker push "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
docker push "${REPO}/${IMAGE_NAME}:${BRANCH}"
# remove tag locally to allow cleanup
docker image rm "${REPO}/${IMAGE_NAME}:${IMAGE_VERSION}"
docker image rm "${REPO}/${IMAGE_NAME}:${BRANCH}"
