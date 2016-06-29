#!/bin/bash

set -o pipefail -e

# Potentially do some variable replacement of nginx config
envsubst < /code/docker_services/nginx/nginx.conf > /etc/nginx/conf.d/default.conf

# start nginx
nginx -g 'daemon off;'
