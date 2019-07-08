#!/bin/bash -xe

# $1 = project name given to docker-compose
PROJECT="${1}"

# Running on temp3 needs *much* longer timeouts once VM hits high load
export DOCKER_CLIENT_TIMEOUT=300
export COMPOSE_HTTP_TIMEOUT=300

function create_volume() {
    # $1 = volume name
    # $2 = original path
    # create the volume
    docker volume create "${1}"
    # copy original path into the volume
    tar -czf - -C "${2}" . \
        | docker run --rm -i -v "${1}:/tmp/jenkins" alpine:3.9 tar -xzf - -C /tmp/jenkins
}

# bind mount volumes from inside container are not accessible to Docker host
# create volumes, copy in bind mount path, replace bind mount with volume mount
while read SERVICE; do
    # Check up to 99 volumes per service
    for i in {0..99}; do
        YAML_PATH="services.${SERVICE}.volumes[${i}]"
        VOL="$(yq r combined.yml "${YAML_PATH}")"
        if [ "${VOL}" == "null" ]; then
            # abort when hitting a null item
            break
        elif [ -r "${VOL%%:*}" ]; then
            # found readable path, create a volume
            VOL_NAME="${PROJECT}_${SERVICE}_temp${i}"
            create_volume "${VOL_NAME}" "${VOL%%:*}"
            # update yaml to use volume instead of bind mount
            yq w -i combined.yml "${YAML_PATH}" "${VOL_NAME}:${VOL#*:}"
        fi
    done
done < <(yq r combined.yml services | grep -v '  .*' | sed 's/:$//')

# waits until a given container reports healthy
function wait_healthy() {
    # $1 = container ID
    # $2 = container name
    FORMAT="{{json .State.Health.Status}}"
    until [ "$(docker inspect --format "${FORMAT}" ${1})" == '"healthy"' ]
    do
        echo "Waiting for ${2} to report healthy"
        sleep 10
    done
}

# launches a single service and waits for its healthcheck to report healthy
function launch_service() {
    # $1 = service name
    docker-compose --verbose -p "${PROJECT}" -f combined.yml up -d "${1}"
    CONTAINER="$(docker-compose -p "${PROJECT}" ps -q ${1} | head -1)"
    wait_healthy ${CONTAINER} ${1}
}

# individual launches to avoid overloading server
launch_service postgres
launch_service rabbitmq
launch_service redis
launch_service solr

# launch the rest of the stack with up -d
#docker-compose -p "${PROJECT}" -f combined.yml up -d
# or, launch just these specific services (websocket and worker are not needed for tests)
docker-compose -p "${PROJECT}" -f combined.yml up -d smtp
docker-compose -p "${PROJECT}" -f combined.yml up -d ice_db
docker-compose -p "${PROJECT}" -f combined.yml up -d ice
launch_service edd

# inject HMAC secret key to ICE container
docker-compose -p "${PROJECT}" -f combined.yml \
    exec -T ice \
    bash -c 'mkdir -p rest-auth; echo $ICE_HMAC_KEY > rest-auth/edd'

# correct the default DATA_DIRECTORY in ICE database
SQL=$(cat <<'EOM'
UPDATE configuration
SET value = '/usr/local/tomcat'
WHERE key = 'DATA_DIRECTORY';
EOM
)
docker-compose -p "${PROJECT}" -f combined.yml \
    exec -T ice_db \
    psql -U iceuser \
    -c "$SQL" \
    ice

# restart ICE so database config change sticks
docker-compose -p "${PROJECT}" -f combined.yml restart ice
