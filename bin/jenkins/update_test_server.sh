#!/bin/bash -xe

EDD_IMAGE="jenkins.jbei.org:5000/jbei/edd-core:master"

docker pull "${EDD_IMAGE}"
docker service update --with-registry-auth --image "${EDD_IMAGE}" edd-test_http
docker service update --with-registry-auth --image "${EDD_IMAGE}" edd-test_worker
docker service update --with-registry-auth --image "${EDD_IMAGE}" edd-test_websocket
