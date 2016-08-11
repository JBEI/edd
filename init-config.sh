#!/bin/bash

COMPLETE="false"
BOLD="\033[1m"
RESET="\033[0m"
SEPARATOR="!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"

function finish {
    if [ "${COMPLETE}" = "false" ]; then
        echo "${SEPARATOR}"
        echo "The init-config.sh script did not complete before exiting. Please correct any"
        echo "issues identified by the output, or file a bug report with the script exit code"
        echo "and any script output."
        echo "${SEPARATOR}"
    fi
}
trap finish EXIT

set +e
EDD_USER=$(git config --get user.name)
EDD_EMAIL=$(git config --get user.email)
if [ -z "${EDD_USER}" ] || [ -z "${EDD_EMAIL}" ]; then
    echo "${SEPARATOR}"
    echo "Could not detect git user. Please re-run this script after configuring your"
    echo "git install with commands like these:"
    echo ""
    echo -e "\t${BOLD}git config --global user.name 'Alice Liddell'${RESET}"
    echo -e "\t${BOLD}git config --global user.email 'aliddell@example.net'${RESET}"
    echo ""
    exit 1
fi
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ ! -f "$DIR/secrets.env" ]; then
    COUNTER=1
    echo "Copying example secrets.env and generating secrets …"
    cp "$DIR/secrets.env-example" "$DIR/secrets.env"
    # replacing the secret{n} values
    while [ $COUNTER -lt 5 ]; do
        EDD_SECRET=`echo "secret${COUNTER} $(date)" | shasum | cut -c 1-32`
        sed -i -e "s/secret${COUNTER}/${EDD_SECRET}/" "$DIR/secrets.env"
        let COUNTER=COUNTER+1
    done
    # replace Django secret
    EDD_SECRET=`echo "secret${COUNTER} $(date)" | shasum | cut -c 1-32`
    set -i -e "s/put some random secret text here/${EDD_SECRET}/" "$DIR/secrets.env"
fi

if [ ! -f "$DIR/edd/settings/local.py" ]; then
    echo "Copying example local.py settings …"
    cp "$DIR/edd/settings/local.py-example" "$DIR/edd/settings/local.py"
    sed -i -e "s/'Jay Bay'/'${EDD_USER}'/;s/'admin@example.org'/'${EDD_EMAIL}'/" \
        "$DIR/edd/settings/local.py"
fi

if [ ! -f "$DIR/docker-compose.override.yml" ]; then
    echo "Copying example docker-compose.override.yml settings …"
    cp "$DIR/docker-compose.override.yml-example" "$DIR/docker-compose.override.yml"
fi

COMPLETE="true"
