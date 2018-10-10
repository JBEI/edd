FROM jbei/edd-node:latest as node

# Copy in EDD code
ARG EDD_VERSION=2.4.0
ARG GIT_BRANCH=master
ARG GIT_URL=https://github.com/JBEI/edd.git
ENV EDD_VERSION="${EDD_VERSION}"
RUN apk add --no-cache git \
    && git clone --depth 1 -b "${GIT_BRANCH}" "${GIT_URL}" code \
    && echo "Cache-bust: ${EDD_VERSION}" \
    && cp ./code/docker_services/edd/webpack/webpack.config.js . \
    && npm run build

# ---

FROM jbei/scikit-learn:latest

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
WORKDIR /code
ARG EDD_VERSION=2.4.0
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8 EDD_VERSION="${EDD_VERSION}"

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
RUN pipenv install --system --deploy --verbose \
    && apk del .build-deps \
    && rm -f Pipfile Pipfile.lock

# Copy in entrypoint shell scripts
COPY entrypoint.sh /usr/local/bin

# Copy in code from node image
COPY --from=node /code /usr/local/edd

# Create user/group to run code
RUN addgroup -g 1000 -S edduser \
    && adduser -u 1000 -S edduser -G edduser

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--help"]
