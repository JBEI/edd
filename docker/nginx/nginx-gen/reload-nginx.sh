#!/bin/bash

set -u

source /usr/local/bin/functions.sh

NGINX_LABEL="com.github.jrcs.letsencrypt_nginx_proxy_companion.nginx_proxy"
NGINX_CONTAINER=$(find_labeled_containers "${NGINX_LABEL}")

# test and reload config together
docker_exec "${NGINX_CONTAINER}" "test_and_reload.sh"
