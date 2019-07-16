#!/bin/bash

# collection of functions using Docker Remote API to manipulate Docker
# see https://docs.docker.com/engine/api/v1.39/ for API docs

# --- Docker API ---
# $1 == API endpoint
# $2 == HTTP verb, defaults to GET
# $3 == payload of API request
function docker_api {
    local url
    local verb="${2:-GET}"
    # -s puts curl into silent mode
    # -X sets the HTTP verb
    local opts=('-s' "-X${verb}")
    # only add payload if one is provided
    if [[ -n "${3:-}" ]]; then
        opts+=('-d' "${3}")
    fi
    # bail out if environment doesn't know where Docker is
    if [[ -z "$DOCKER_HOST" ]]; then
        echo "Error DOCKER_HOST variable not set" >&2
        return 1
    fi
    # convert $DOCKER_HOST into a target URL for curl
    if [[ "$DOCKER_HOST" == unix://* ]]; then
        opts+=('--unix-socket' "${DOCKER_HOST#unix://}")
        url='http://localhost'
    else
        url="http://${DOCKER_HOST#*://}"
    fi
    # tell API payload is JSON when doing a POST request
    [[ "$verb" = "POST" ]] && opts+=('-H' 'Content-Type: application/json')
    # send the request
    curl "${opts[@]}" "${url}${1}"
}

EXEC_TEMPLATE=$(cat <<'EOF'
{
    "AttachStderr": true,
    "AttachStdin": false,
    "AttachStdout": true,
    "Cmd": $cmd,
    "Tty": false
}
EOF
)

# --- Run docker exec ---
# $1 == container ID
# $2..n == command and arguments
function docker_exec {
    local id="${1?missing ID}"
    shift
    # collect all remaining function arguments into bash array
    local cmd=("$@")
    # converting bash array to json array with jq
    local cmd_json
    cmd_json="$(printf '%s\n' "${cmd[@]}" | jq -R . | jq -cs .)"
    # inserting json array into template with jq
    local payload
    payload="$(jq -cn --argjson cmd "${cmd_json}" "$EXEC_TEMPLATE")"
    # create exec instance, pull ID from response
    exec_id=$(docker_api "/containers/${id}/exec" "POST" "${payload}" | jq -r .Id)
    if [[ -n "${exec_id}" && "${exec_id}" != "null" ]]; then
        # start the exec instance
        docker_api "/exec/${exec_id}/start" "POST" '{"Detach":false,"tty":false}'
    else
        # report failure
        echo "Cannot exec command ${cmd[0]:missing CMD} in container ${id}."
        return 1
    fi
}

# --- Find containers with a label ---
# $1 == label text
function find_labeled_containers {
    # iterate returned values
    # | pick out those where the "Labels" attribute matches the function argument
    # | fetch the "Id" attribute of selected items
    local jq_cmd='.[] | select(.Labels["'${1}'"]) | .Id'
    # fetch all container JSON data, pipe to above command to get labeled IDs
    docker_api "/containers/json" | jq -r "${jq_cmd}"
}

# --- Check container status ---
# $1 == container ID
function check_status {
    docker_api "/containers/${1}/json" | jq -r '.State.Health.Status'
}
