#!/bin/bash

set -u

source /usr/local/bin/functions.sh

# Sending signals too soon causes the nginx container to never run healthchecks
NGINX_LABEL="com.github.jrcs.letsencrypt_nginx_proxy_companion.nginx_proxy"
while true; do
    NGINX_CONTAINER=$(find_labeled_containers "${NGINX_LABEL}")
    if [[ -n "${NGINX_CONTAINER}" ]]; then
        if [[ $(check_status "${NGINX_CONTAINER}") == "healthy" ]]; then
            break
        fi
    fi
    echo "Waiting for NGINX to start"
    sleep 5
done

echo "Generating NGINX proxy configurations"

exec /usr/local/bin/docker-gen \
    -watch \
    -notify \
    reload-nginx.sh \
    /etc/docker-gen/templates/nginx.tmpl \
    /etc/nginx/conf.d/default.conf
