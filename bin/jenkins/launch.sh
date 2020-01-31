#!/bin/bash -xe

# $1 = image tag generated by Jenkins
# $2 = project name given to docker-compose
TAG="${1}"
PROJECT="${2}"

# Running on temp3 needs *much* longer timeouts once VM hits high load
export DOCKER_CLIENT_TIMEOUT=300
export COMPOSE_HTTP_TIMEOUT=300

function create_volume() {
    # $1 = volume name
    # $2 = original path
    # create the volume
    docker volume create "${1}"
    if [ -d "${2}" ]; then
        src_dir="${2}"
        src_copy="."
    else
        # when not a directory, copying individual file
        src_dir="$(dirname "${2}")"
        src_copy="$(basename "${2}")"
    fi
    # copy original path into the volume
    tar -czf - -C "${src_dir}" "${src_copy}" \
        | docker run --rm -i -v "${1}:/tmp/jenkins" alpine:3.9 tar -xzf - -C /tmp/jenkins
}

# bind mount volumes from inside container are not accessible to Docker host
# pull out list of all services first
SERVICES=( )
while read SERVICE; do
    SERVICES+=( "${SERVICE}" )
done < <(yq r docker-compose.override.yml services | grep -v '  .*' | sed 's/:$//')
# create volumes, copy in bind mount path, replace bind mount with volume mount
for SERVICE in "${SERVICES[@]}"; do
    N=0
    YAML_PATH="services.${SERVICE}.volumes"
    while read VOLUME; do
        # strip off leading hyphen-and-space
        VOLUME="${VOLUME#*- }"
        # part before first colon
        SRC="${VOLUME%%:*}"
        # part after first colon
        TARGET="${VOLUME#*:}"
        # only volume copy readable files/directories
        # this ignores /var/run/docker.sock
        if [ -r "${SRC}" ] && [ -f "${SRC}" -o -d "${SRC}" ]; then
            # define name used in compose file
            VOL_TAG="${SERVICE}_${N}"
            # define new volume name
            VOL_NAME="${PROJECT}_${VOL_TAG}"
            # copy contents of SRC to volume
            create_volume "${VOL_NAME}" "${SRC}"
            if [ -f "${SRC}" ]; then
                # when doing a single file, mount volume to parent dir
                # because volume becomes directory with single file
                PARENT="$(dirname "${TARGET%%:*}")"
                OPTS="${TARGET#*:}"
                if [ "${OPTS}" != "" ]; then
                    TARGET="${PARENT}:${OPTS}"
                else
                    TARGET="${PARENT}"
                fi
            fi
            # replace volume entry with one using new volume name
            yq w -i docker-compose.override.yml \
                "${YAML_PATH}[${N}]" \
                "${VOL_TAG}:${TARGET}"
            # add reference to volume name in volumes section
            yq w -i docker-compose.override.yml "volumes.${VOL_TAG}.temp" ""
            yq d -i docker-compose.override.yml "volumes.${VOL_TAG}.temp"
        fi
        N=$((N + 1))
    done < <(yq r docker-compose.override.yml "${YAML_PATH}")
done


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

# Rewrite docker-compose.override.yml to point at registry tagged images
sed -i.bak \
    -e 's|image: jbei|image: jenkins.jbei.org:5000/jbei|' \
    docker-compose.override.yml
rm docker-compose.override.yml.bak

# Rewrite docker-compose.override.yml to insert correct image tag
yq w -s - -i docker-compose.override.yml <<EOF
services.http.image: jbei/edd-core:${TAG}
services.websocket.image: jbei/edd-core:${TAG}
services.worker.image: jbei/edd-core:${TAG}
EOF

# Pre-build other images
docker-compose build --pull postgres
docker-compose build --pull rabbitmq
docker-compose build --pull redis
docker-compose build --pull solr

# Copy default example settings
cp settings/example settings/__init__.py

## launch the stack with up -d
docker-compose -p "${PROJECT}" up -d

# wait for ice to finish coming up
# no built-in healthcheck, so just curl directly in container
url="http://localhost:8080"
until docker-compose -p "${PROJECT}" exec -T ice curl --fail -ISs "$url"; do
    echo "Waiting on ICE"
    sleep 10
done

# correct the default DATA_DIRECTORY in ICE database
SQL=$(cat <<'EOM'
UPDATE configuration
SET value = '/usr/local/tomcat/data'
WHERE key = 'DATA_DIRECTORY';
EOM
)
docker-compose -p "${PROJECT}" \
    exec -T ice_db \
    psql -U iceuser \
    -c "$SQL" \
    ice

# restart ICE so database config change in database applies
docker-compose -p "${PROJECT}" restart ice

# wait for edd to report healthy
edd="$(docker-compose -p "${PROJECT}" ps -q http | head -1)"
wait_healthy "$edd" "http"
