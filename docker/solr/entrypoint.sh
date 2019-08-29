#!/bin/bash

set -e

SOLR=/opt/solr/bin/solr
CONFD=/opt/solr/configset.d

# Start Solr on an alternate port; Solr must be running to configure
# Running on another port allows to hide from the other containers until we're ready
"${SOLR}" start -c -p 5555
cd "${CONFD}"
for NAME in *; do
    # add the config to Zookeeeper; it's OK if it already exists
    "${SOLR}" zk upconfig -n "${NAME}" -d "${CONFD}/${NAME}/" -z localhost:6555
done
"${SOLR}" stop -p 5555

# start solr on the expected ports to begin service
exec "${SOLR}" start -f -c
