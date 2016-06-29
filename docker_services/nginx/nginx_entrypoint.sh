#!/bin/bash

set -o pipefail -e

# Potentially do some variable replacement of nginx config
envsubst < /code/docker_services/nginx/nginx.conf > /etc/nginx/nginx.conf

# start nginx
nginx -g 'daemon off;'
