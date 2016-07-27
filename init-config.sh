#!/bin/bash

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
    EDD_USER=$(git config --get user.name)
    EDD_EMAIL=$(git config --get user.email)
    if [ ! -z "$EDD_USER" ] && [ ! -z "$EDD_EMAIL" ]; then
        sed -i -e "s/'Jay Bay'/'${EDD_USER}'/;s/'admin@example.org'/'${EDD_EMAIL}'/" \
            "$DIR/edd/settings/local.py"
    else
        echo "Warning! Have not replaced admin email in $DIR/edd/settings/local.py"
    fi
fi
