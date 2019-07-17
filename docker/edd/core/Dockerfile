# arguments and defaults used with docker build command
ARG EDD_VERSION="manual-build"
ARG GIT_BRANCH=master
ARG GIT_URL=https://github.com/JBEI/edd.git
ARG TARGET="dev"

# ---

FROM jbei/scikit-learn:latest as base

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

WORKDIR /code
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

RUN set -ex \
    # update package index from base file
    && apk update \
    # need build tools to compile gevent and greenlet
    # (just copying build-deps from python Dockerfile)
    && apk add --virtual .build-deps \
        bzip2-dev \
        coreutils \
        dpkg-dev dpkg \
        expat-dev \
        g++ \
        gcc \
        gdbm-dev \
        jpeg-dev \
        libc-dev \
        libffi-dev \
        libldap \
        libnsl-dev \
        libsasl \
        libtirpc-dev \
        linux-headers \
        make \
        ncurses-dev \
        libressl \
        libressl-dev \
        openldap-dev \
        pax-utils \
        postgresql-dev \
        readline-dev \
        sqlite-dev \
        xz-dev \
        zlib-dev \
    && apk add --no-cache \
        # need libjpeg for Pillow to work
        libjpeg \
        # need mailcap to install /etc/mime.types database
        mailcap \
        # use su-exec to step down from root
        su-exec \
    && pipenv --version

COPY Pipfile Pipfile.lock /code/

# ---

FROM base as prod-preinstall

# nothing special for prod
ARG EDD_VERSION

RUN echo "Production pre-install for EDD ${EDD_VERSION}" \
    && pipenv install --system --deploy --verbose \
    && apk del .build-deps \
    && rm -f Pipfile Pipfile.lock

# ---

FROM base as dev-preinstall

ARG EDD_VERSION

# install coverage-py
RUN echo "Development pre-install for EDD ${EDD_VERSION}" \
    && pipenv install --dev --system --deploy --verbose \
    && apk del .build-deps \
    && rm -f Pipfile Pipfile.lock

# ---

FROM jbei/edd-node:latest as node

# set environment in this build phase with the version passed as argument
ARG EDD_VERSION
ARG GIT_BRANCH
ARG GIT_URL
ENV EDD_VERSION="${EDD_VERSION}" GIT_BRANCH="${GIT_BRANCH}" GIT_URL="${GIT_URL}"

WORKDIR /run/

# Install git
RUN apk add --no-cache git \
    # copy in EDD repo
    && git clone --depth 1 -b "${GIT_BRANCH}" "${GIT_URL}" edd \
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

# Copy in entrypoint shell scripts
COPY entrypoint.sh /usr/local/bin/

# Copy in code from node image
COPY --from=node /run/edd/server /usr/local/edd/
COPY --from=node /run/edd.hash /edd.hash

# Create user/group to run code
RUN addgroup -g 1000 -S edduser \
    && adduser -u 1000 -S edduser -G edduser \
    # create log directory
    && mkdir -p /var/log/edd \
    # run collectstatic to set static assets in build
    && cd /usr/local/edd \
    && python manage.py collectstatic \
        --noinput \
        --settings "edd.settings.build_collectstatic"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--help"]
