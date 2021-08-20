# arguments and defaults used with docker build command
ARG EDD_VERSION="manual-build"
ARG NODE_VERSION="latest"
ARG REPO_SERVER="docker.io"
ARG SKLEARN_BASE_VERSION="20.03"
ARG TARGET="dev"

# ---

FROM ${REPO_SERVER}/jbei/scikit-learn:${SKLEARN_BASE_VERSION} as prod-preinstall

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
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM ${REPO_SERVER}/jbei/scikit-learn:${SKLEARN_BASE_VERSION} as dev-preinstall

WORKDIR /install
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

COPY ./docker/edd/core/Pipfile* /install/
COPY ./docker/edd/core/bin/* /usr/local/bin/

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
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM ${REPO_SERVER}/jbei/edd-node:${NODE_VERSION} as node

# set environment in this build phase with the version passed as argument
ARG EDD_VERSION
ENV EDD_VERSION="${EDD_VERSION}"

WORKDIR /run/
COPY ./typescript ./.prettierrc.js /run/

# build the TypeScript code
RUN ls -al && npm run build

# ---

FROM ${TARGET}-preinstall as configure

WORKDIR /tmp/
COPY ./.git /tmp/.git

RUN git rev-parse --short HEAD > /tmp/edd.hash

# ---

FROM ${TARGET}-preinstall as staticfiles

WORKDIR /usr/local/edd
# Copy in python code
COPY ./server /usr/local/edd
# Copy in commit hash from configure image
COPY --from=configure /tmp/edd.hash /edd.hash

RUN python manage.py collectstatic \
    --noinput \
    --settings "edd.settings.build_collectstatic" \
 && find /usr/local/edd/ -type d -name static -exec rm -rf \{\} \+ \
 && find /usr/local/edd/ -type d -name __pycache__ -exec rm -rf \{\} \+

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
# Copy in python code
COPY --from=staticfiles /usr/local/edd /usr/local/edd
# Copy in static assets
COPY --from=staticfiles /usr/local/edd-static /usr/local/edd-static
COPY --from=node /run/dist /usr/local/edd-static/dist
# Copy in commit hash from configure image
COPY --from=configure /tmp/edd.hash /edd.hash

# Create user/group to run code
RUN addgroup --gid 1000 --system edduser \
 && adduser --uid 1000 --system edduser --gid 1000 \
# create log directory
 && mkdir -p /var/log/edd

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--list"]
