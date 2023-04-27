#!/bin/bash

set -euxo pipefail

# run the invoke setup
invoke "$@"

# invoke should generate script to exec for ultimate container process
if [ -x /usr/local/bin/start_edd_process.sh ]; then
    exec /usr/local/bin/start_edd_process.sh
fi

# when script is not generated, complain then exit
>&2 echo "No startup command found, exiting ..."
