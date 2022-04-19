# arguments and defaults used with docker build command
ARG EDD_VERSION="manual-build"
ARG TARGET="dev"

# ---

FROM node:lts-alpine as edd-node

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY ./docker/edd/core/package.json /run/

WORKDIR /run/

RUN apk add --no-cache zsh \
 && yarn install --non-interactive --ignore-optional \
 && yarn cache clean

CMD ["/bin/zsh"]

# ---

FROM library/python:3.10-slim-bullseye as pybase

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

WORKDIR /tmp

RUN set -ex \
 && apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade \
 && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
    curl \
    git \
    gosu \
    mime-support \
    netcat-openbsd \
    tini \
 && pip install \
    numpy \
    pipenv \
    python-libsbml \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache \
 && find /usr/local/lib/ -name __pycache__ | xargs rm -rf

# ---

FROM pybase as prod-preinstall

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
 && apt autoremove -y \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM pybase as dev-preinstall

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
 && apt autoremove -y \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM edd-node as typescript

WORKDIR /run/
COPY ./typescript ./.prettierrc.js /run/

# build & test the TypeScript code
RUN ls -al && yarn build

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
COPY --from=typescript /run/dist /usr/local/edd-static/dist
# Copy in commit hash from configure image
COPY --from=configure /tmp/edd.hash /edd.hash

# Create user/group to run code
RUN addgroup --gid 1000 --system edduser \
 && adduser --uid 1000 --system edduser --gid 1000 \
# create log directory
 && mkdir -p /var/log/edd

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--list"]
