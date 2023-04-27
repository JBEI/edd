#!/usr/bin/env bash

set -eo pipefail

DOCKER="$(which docker)"
GIT="$(which git)"
TAR="$(which tar)"

# sanity checks that prerequisites are present
if [ ! -x "${DOCKER}" ]; then
    echo "Could not find or execute Docker, exiting ..."
    return 3 2>/dev/null || exit 3
elif [ ! -x "${GIT}" ]; then
    echo "Could not find or execute git (how did you even clone the repo?), exiting ..."
    return 4 2>/dev/null || exit 4
elif [ ! -x "${TAR}" ]; then
    echo "Could not find or execute tar, exiting ..."
    return 5 2>/dev/null || exit 5
fi

echo 'Setting up quickstart environment'
export EDD_DIR="$(cd "$(dirname "$(dirname $0)")" && pwd)"
DOCKER_BUILDKIT=1 ${DOCKER} build -t jbei/edd-config --target setup "${EDD_DIR}"
echo 'Creating initial configration scripts'
# sanity check logs
if [ -d "${EDD_DIR}/log" ]; then
    OUT_LOG="${EDD_DIR}/log/config.log"
else
    OUT_LOG="/dev/null"
fi
# make config container
# TODO: handle interactive and pass docker.sock for auto-launch
container_id="$("${DOCKER}" create \
    --env EDD_DIR \
    --env EDD_DOMAIN \
    "jbei/edd-config:${EDD_VERSION:-latest}" \
    offline --deploy=dev)"
# no longer need the environment variable past this point
unset EDD_DIR
# run it and wait for completion
"${DOCKER}" start "${container_id}" 2>&1 >> "${OUT_LOG}"
"${DOCKER}" wait "${container_id}" 2>&1 >> "${OUT_LOG}"
# pull out the config tarball
if "${DOCKER}" cp "${container_id}:/tmp/edd-config.tgz" . 2>&1 >> "${OUT_LOG}"; then
    "${TAR}" -xzvf edd-config.tgz
    rm edd-config.tgz
else
    # see what went wrong when copy fails
    "${DOCKER}" inspect "${container_id}" 2>&1 >> "${OUT_LOG}"
    "${DOCKER}" logs "${container_id}" 2>&1 >> "${OUT_LOG}"
fi
"${DOCKER}" rm "${container_id}" 2>&1 >> "${OUT_LOG}"
cat "${OUT_LOG}"
echo 'Creating default (dev-only!) settings'
cp settings/example settings/__init__.py
