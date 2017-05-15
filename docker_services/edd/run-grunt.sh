#!/usr/bin/env bash

set -eo pipefail

if [ -x "/code" ]; then
    BASEDIR="/code"
elif [ -x "/usr/local/edd" ]; then
    BASEDIR="/usr/local/edd"
else
    (>&2 echo "Cannot locate base directory for Grunt.")
    exit 1
fi

ln -s "${BASEDIR}/Gruntfile.js" .
grunt --base "$BASEDIR"

ln -s "${BASEDIR}/bower.json" .
echo "{'directory':'${BASEDIR}/main/static/lib'}" | tr "'" '"' > .bowerrc
bower --allow-root install

