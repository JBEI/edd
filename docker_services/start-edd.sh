#!/usr/bin/env bash

set -eo pipefail

function check_brew() {
    if [ ! -x "$(which brew)" ]; then
        # Install brew if missing

        /usr/bin/ruby -e \
            "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
        if [ ! $? -eq 0 ]; then
            return 1
        fi
    fi
}

function check_gnu_getopt() {
    opt="$(getopt -o 'a' -- -a)"
    if [ "$opt" == " -a --" ]; then
        # GNU getopt is in use
        GETOPT="$(which getopt)"
    elif [ "$(uname)" == "Darwin" ]; then
        check_brew
        if ! brew --prefix gnu-getopt > /dev/null 2>&1; then
            echo "Updating Homebrew"
            brew update
            brew install gnu-getopt
        fi
        GETOPT="$(brew --prefix gnu-getopt)/bin/getopt"
    else
        (>&2 echo "GNU getopt not installed, ignoring script arguments")
    fi
}

function print_help() {
    echo "Starts up the services required to run the Experiment Data Depot."
    echo
    echo "Usage: $0 [-h|--help] [--build|--pull] [options]"
    echo "Options:"
    echo "    -h, --help"
    echo "        Print this help message."
    echo
    echo "  IMAGE RESOLUTION MODES"
    echo "    This launcher allows for some basic configuration on how container images are"
    echo "    resolved. The default behavior will first search for an image in the local cache,"
    echo "    then search in the Docker Registry if not found (by default, hub.docker.com), then"
    echo "    finally will build the image from Dockerfiles if not found in the Docker Registry."
    echo "    Changing the image resolution mode will force the script to resolve container images"
    echo "    in an alternate order."
    echo
    echo "    --build"
    echo "        Forces building Docker images from Dockerfiles."
    echo "    --pull"
    echo "        Forces pulling Docker images from the system configured Docker Registry."
    echo "    --default"
    echo "        Uses default image resolution behavior; overrides previously listed flags."
    echo
}

# Follow links until at the true script location
SELF="$0"
while [ -h "$SELF" ]; do
    list="$(ls -ld "$SELF")"
    target="$(expr "$list" : '.*-> \(.*\)$')"
    if expr "$target" : '/.*' > /dev/null; then
        SELF="$target"
    else
        SELF="$(dirname "$SELF")/$target"
    fi
done
# get full path to directory by switching to it and using pwd
SELFDIR="$(cd "$(dirname "$SELF")"; pwd)"
cd "$SELFDIR"

MODE=default
if [ ! $# -eq 0 ]; then
    check_gnu_getopt
    short='h'
    long='help,build,pull,default'
    params="$($GETOPT -o "$short" -l "$long" --name "$0" -- "$@")"
    eval set -- "$params"
    while [ ! $# -eq 0 ]; do
        case "$1" in
            --help | -h)
                print_help
                shift
                set +o pipefail
                return 0 2>/dev/null || exit 0
                ;;
            --build)
                MODE=build
                shift
                ;;
            --pull)
                MODE=pull
                shift
                ;;
            --default)
                MODE=default
                shift
                ;;
            *)
                break
                ;;
        esac
    done
fi

# Execute alternate launch modes
if [ "$MODE" = "build" ]; then
    docker-compose build
elif [ "$MODE" = "pull" ]; then
    docker-compose pull
fi
# Start up the containers needed for initial setup
docker-compose up -d init

# Run the grunt tasks + bower install
docker run --rm -it \
    --volumes-from "$(docker-compose ps -q init | head -1)" \
    -v "${SELFDIR}/edd/run-grunt.sh:/run-grunt.sh" \
    jbei/edd-node:1.0.0 \
    "/run-grunt.sh"

# Use entrypoint to do only static files initialization
docker-compose exec init /usr/local/bin/entrypoint.sh -As --quiet init-exit

# Start up everything else
docker-compose up -d
