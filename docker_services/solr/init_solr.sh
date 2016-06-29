#!/bin/bash

set -o pipefail -e

# Check the solr core definitions
if ! tar -cf - -C /code/docker_services/solr/cores . | tee /tmp/cores.tar | shasum -a 256 -b -c /opt/solr/server/solr/signature.txt; then
    shasum -a 256 -b < /tmp/cores.tar > /opt/solr/server/solr/signature.txt
    tar -xf /tmp/cores.tar -C /opt/solr/server/solr/
fi

# start solr
/opt/solr/bin/solr start -f
