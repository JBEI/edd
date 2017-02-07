#!/bin/bash

COMPLETE="false"
BOLD="\033[1m"
RESET="\033[0m"
SEPARATOR="!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"

function finish() {
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
PROJECT=
while [ ! $# -eq 0 ]; do
    case "$1" in
        --project)
            PROJECT="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

if [ ! -z "$2" ]; then
    EDD_EMAIL="$2"
else
    EDD_EMAIL=$(git config --get user.email)
fi
if [ ! -z "$1" ]; then
    EDD_USER="$1"
else
    EDD_USER=$(git config --get user.name)
fi
if [ -z "${EDD_USER}" ] || [ -z "${EDD_EMAIL}" ]; then
    echo "${SEPARATOR}"
    echo "Could not detect git user. Please re-run this script with your name and email, or"
    echo "after configuring your git install with commands like these:"
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
        # in-place edit, save backup to .bak file
        sed -i.bak -e "s/secret${COUNTER}/${EDD_SECRET}/" "$DIR/secrets.env"
        let COUNTER=COUNTER+1
    done
    # replace Django secret
    EDD_SECRET=`echo "secret${COUNTER} $(date)" | shasum | cut -c 1-32`
    # in-place edit, save backup to .bak file
    sed -i.bak -e "s/put some random secret text here/${EDD_SECRET}/" "$DIR/secrets.env"
    # remove backup file
    rm "$DIR/secrets.env.bak"
fi

if [ ! -f "$DIR/docker-compose.override.yml" ]; then
    echo "Copying example docker-compose.override.yml settings …"
    cp "$DIR/docker-compose.override.yml-example" "$DIR/docker-compose.override.yml"
    sed -i.bak -e "s/Alice Liddell/${EDD_USER}/;s/aliddell@example.net/${EDD_EMAIL}/" \
        "$DIR/docker-compose.override.yml"
    rm "$DIR/docker-compose.override.yml.bak"
fi

if [ ! -z "$PROJECT" ]; then
    if [ -x `which virtualenvwrapper.sh` ]; then
        source `which virtualenvwrapper.sh`
        if lsvirtualenv -b | grep -qe "^${PROJECT}$"; then
            echo "Specified project name ${PROJECT}, but a virtualenv with that name"
            echo "already exists. No virtualenv was creted for the project."
            exit 1
        fi
        mkvirtualenv -a "$DIR" "$PROJECT"
        echo "export COMPOSE_PROJECT_NAME=$PROJECT" >> $VIRTUAL_ENV/bin/postactivate
        echo "unset COMPOSE_PROJECT_NAME" >> $VIRTUAL_ENV/bin/predeactivate
    else
        echo "A project name was specified, but virtualenvwrapper is not installed."
        echo "No virtualenv was created for the project."
        exit 1
    fi
fi

COMPLETE="true"
