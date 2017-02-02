#!/bin/bash
set -o pipefail -e

conf='/etc/exim4/update-exim4.conf.conf'
sed_commands=''
function replace_config() {
    while [ $# -gt 0 ]; do
        key="$1"
        value="$2"
        shift 2
        if ! grep -qE "^#?${key}=" "$conf"; then
            echo >&2 "error: '$key' not found in '$conf'"
            exit 1
        fi
        escaped="$(echo "$value" | sed 's/[\/&]/\\&/g')"
        sed_commands+=$'\n\t'"s/^#?(${key})=.*/\1='${escaped}'/;"
    done
}

opts=(
    dc_local_interfaces "[0.0.0.0]:${PORT:-25} ; [::0]:${PORT:-25}"
    dc_other_hostnames ''
    dc_relay_nets "$(ip addr show dev eth0 | awk '$1 == "inet" { print $2 }')"
    dc_eximconfig_configtype 'internet'
)

replace_config "${opts[@]}"

set -x
sed -ri "${sed_commands}"$'\n' "$conf"
update-exim4.conf -v

exec "$@"
