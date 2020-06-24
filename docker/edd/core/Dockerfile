# arguments and defaults used with docker build command
ARG EDD_VERSION="manual-build"
ARG NODE_VERSION="latest"
ARG SKLEARN_BASE_VERSION="20.03"
ARG TARGET="dev"

# ---

FROM jbei/scikit-learn:${SKLEARN_BASE_VERSION} as prod-preinstall

WORKDIR /install
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

COPY ./docker/edd/core/Pipfile* /install/

RUN set -ex \
    # update package index from base file
    && apt-get update \
    # need build tools to compile some python packages
    && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
        build-essential \
        libldap2-dev \
        libsasl2-dev \
    # not installing dev packages in prod
    && pipenv install --system --deploy --verbose \
    && DEBIAN_FRONTEND=noninteractive apt-get -y purge \
        build-essential \
        libldap2-dev \
        libsasl2-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ---

FROM jbei/scikit-learn:${SKLEARN_BASE_VERSION} as dev-preinstall

WORKDIR /install
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

COPY ./docker/edd/core/Pipfile* /install/
COPY ./docker/edd/core/run_tests.sh /usr/local/bin/run_tests.sh

RUN set -ex \
    # update package index from base file
    && apt-get update \
    # need build tools to compile some python packages
    && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
        build-essential \
        libldap2-dev \
        libsasl2-dev \
    # including dev packages in dev
    && pipenv install --dev --system --deploy --verbose \
    && DEBIAN_FRONTEND=noninteractive apt-get -y purge \
        build-essential \
        libldap2-dev \
        libsasl2-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ---

FROM jbei/edd-node:${NODE_VERSION} as node

# set environment in this build phase with the version passed as argument
ARG EDD_VERSION
ENV EDD_VERSION="${EDD_VERSION}"

WORKDIR /run/

COPY . ./edd

# Remove any local __pycache__ and/or .pyc files
RUN find ./edd \( -name '*.pyc' -o -name '__pycache__' \) -delete \
    # install git
    && apk add --no-cache git \
    # save commit hash to file for later use
    && git -C edd rev-parse --short HEAD > edd.hash \
    # cache-bust using version argument
    && echo "Building TypeScript for EDD ${EDD_VERSION} $(cat edd.hash)" \
    # build the TypeScript code
    && npm run build

# ---

FROM ${TARGET}-preinstall as install

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ARG EDD_VERSION

ENV EDD_VERSION="${EDD_VERSION}"
WORKDIR /code

# Copy in invoke config
COPY ./docker/edd/core/invoke.yaml /etc/invoke.yaml
# Copy in invoke scripts
COPY ./docker/edd/core/tasks /usr/local/edd-invoke/tasks
# Copy in entrypoint
COPY ./docker/edd/core/entrypoint.sh /usr/local/bin/entrypoint.sh

# Copy in code from node image
COPY --from=node /run/edd/server /usr/local/edd/
COPY --from=node /run/edd.hash /edd.hash

# Create user/group to run code
RUN addgroup --gid 1000 --system edduser \
    && adduser --uid 1000 --system edduser --gid 1000 \
    # create log directory
    && mkdir -p /var/log/edd \
    # run collectstatic to set static assets in build
    && cd /usr/local/edd \
    && python manage.py collectstatic \
        --noinput \
        --settings "edd.settings.build_collectstatic"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--list"]
