#!/bin/bash

# copy the solr core definitions
tar -cf - -C /code/docker_services/solr/cores . | tar xf - -C /opt/solr/server/solr/

# start solr
/opt/solr/bin/solr start -f
