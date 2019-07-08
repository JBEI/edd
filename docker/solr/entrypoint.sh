#!/bin/bash

set -o pipefail -e

# Ensure the signature file at least exists for the following comparison
SIGFILE=/opt/solr/server/solr/signature.txt
touch $SIGFILE

# Go to directory in image containing core definitions
cd /tmp/cores
# Make a tarball, save signature
tar -cf - -C /tmp/cores . | tee /tmp/cores.tar | sha256sum > /tmp/cores.sig
echo "Solr using core definitions with signature $(cat /tmp/cores.sig)"
# Check the solr core definitions
if [ "$(cat /tmp/cores.sig)" != "$(cat "${SIGFILE}")" ]; then
    # if the SHA-256 hash did not match
    # copy the new core configs
    tar -xf /tmp/cores.tar -C /opt/solr/server/solr/
    # copy the new signature file to data volume
    cp /tmp/cores.sig ${SIGFILE}
fi

# duplicate the core configs to create the swap versions
BASE="/opt/solr/server/solr"
# loop over the names in the loaded cores
for NAME in *; do
    CORE="${BASE}/${NAME}"
    SWAP="${BASE}/${NAME}_swap"
    # if the swap version of core does not exist, make it
    if [ ! -d "${SWAP}" ]; then
        # create swap core directory
        mkdir "${SWAP}"
        # symlink config to the primary core config
        ln -s "../${NAME}/conf" "${SWAP}"
    fi
    # enforce core naming; sometimes Solr will shutdown with two cores having same name
    echo "name=${NAME}" > "${CORE}/core.properties"
    echo "name=${NAME}_swap" > "${SWAP}/core.properties"
done

# start solr
exec /opt/solr/bin/solr start -f
