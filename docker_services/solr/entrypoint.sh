#!/bin/bash

set -o pipefail -e

# Ensure the signature file at least exists for the following comparison
SIGFILE=/opt/solr/server/solr/signature.txt
touch $SIGFILE

# Check the solr core definitions
if ! tar -cf - -C /tmp/cores . | tee /tmp/cores.tar | sha256sum -c $SIGFILE; then
    sha256sum < /tmp/cores.tar > $SIGFILE
    tar -xf /tmp/cores.tar -C /opt/solr/server/solr/
fi

# start solr
exec /opt/solr/bin/solr start -f
