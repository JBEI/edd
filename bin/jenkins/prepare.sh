#!/bin/bash -xe

# $1 = image tag generated by Jenkins

# Rewrite docker-compose.override.yml using correct image tag
sed -i.bak \
    -e "s|#image: tagname|image: jbei/edd-core:${1}|" \
    docker-compose.override.yml
rm docker-compose.override.yml.bak

# Rewrite docker-compose.yml to point at registry tagged images
sed -i.bak \
    -e 's|image: jbei|image: jenkins.jbei.org:5000/jbei|' \
    docker-compose.yml
rm docker-compose.yml.bak

# Check configs and write out a combined file
docker-compose \
    -f docker-compose.yml \
    -f docker-compose.override.yml \
    -f ice.yml \
    config > combined.yml
cat combined.yml

# Pre-build other images
docker-compose -f combined.yml build --pull postgres
docker-compose -f combined.yml build --pull rabbitmq
docker-compose -f combined.yml build --pull redis
docker-compose -f combined.yml build --pull solr
