#!/bin/bash

set -o pipefail -e

# Sending signals too soon causes the nginx container to never run healthchecks
until nc -z nginx 80; do
    sleep 15
done

echo "Detected NGINX is serving, now generating container proxy configs!"

exec /usr/local/bin/docker-gen "$@"
