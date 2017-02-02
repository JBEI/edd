#!/bin/bash

set -eo pipefail

# this seems gross, but it gets IP addresses on Docker network without installing anything
server_ip=$(ping -c 1 $1 | awk -F'[ :]' 'NR==2 { print $4 }')

# TODO: not clear this is really testing the service listening on port 25, or if it is just
#   checking if a healthy service would accept connections from argument
if echo -e "helo ${server_ip}\nquit" | exim -bh ${server_ip}; then
    exit 0
fi

exit 1
