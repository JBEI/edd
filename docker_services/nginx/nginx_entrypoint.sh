#!/bin/bash

set -o pipefail -e

# copy dhparam.pem to target if exists; otherwise, if target missing, create a new one
if [ -r /code/docker_services/nginx/ssl/dhparam.pem ]; then
    echo "Copying dhparam.pem to Docker TLS volume …"
    cp /code/docker_services/nginx/ssl/dhparam.pem /etc/ssl/edd/dhparam.pem
elif [ ! -r /etc/ssl/edd/dhparam.pem ]; then
    echo "Creating Diffie-Hellman parameters, this may take a while …"
    openssl dhparam 2048 -out /etc/ssl/edd/dhparam.pem
fi

# copy certificate and key to target if exists; otherwise, if target missing, create new ones
if [ -r /code/docker_services/nginx/ssl/certificate.chained.crt ] \
        && [ -r /code/docker_services/nginx/ssl/certificate.key ]; then
    echo "Copying certificate and key to Docker TLS volume …"
    cp /code/docker_services/nginx/ssl/certificate.chained.crt /etc/ssl/edd/certificate.chained.crt
    cp /code/docker_services/nginx/ssl/certificate.key /etc/ssl/edd/certificate.key
elif [ ! -r /etc/ssl/edd/certificate.chained.crt ] || [ ! -r /etc/ssl/edd/certificate.key ]; then
    echo "Generating self-signed TLS certificate …"
    openssl req -new \
        -newkey rsa:4096 \
        -days 365 \
        -nodes \
        -x509 \
        -subj "/C=US/ST=New Mexico/L=Black Mesa/O=BMRF/OU=Science/CN=*" \
        -keyout /etc/ssl/edd/certificate.key \
        -out /etc/ssl/edd/certificate.chained.crt
fi

# copy trustchain to target if exists
if [ -r /code/docker_services/nginx/ssl/trustchain.crt ]; then
    echo "Copying trustchain to Docker TLS volume …"
    cp /code/docker_services/nginx/ssl/trustchain.crt /etc/ssl/edd/trustchain.crt
elif [ ! -r /etc/ssl/edd/trustchain.crt ]; then
    echo "Copying self-signed certificate as trustchain …"
    cp /etc/ssl/edd/certificate.chained.crt /etc/ssl/edd/trustchain.crt
fi

# Potentially do some variable replacement of nginx config
# Insert vars in quotes to envsubst, e.g. commented command will only sub $VAR1 and $VAR2
#envsubst '$VAR1 $VAR2' < /code/docker_services/nginx/nginx.conf > /etc/nginx/nginx.conf
envsubst '' < /code/docker_services/nginx/nginx.conf > /etc/nginx/nginx.conf

# start nginx
nginx -g 'daemon off;'
