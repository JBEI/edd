FROM library/python:3.6-alpine3.8

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

RUN set -ex \
    # update package index from base file
    && apk update \
    # image needs netcat
    && apk --update add --no-cache \
        bash \
        curl \
        netcat-openbsd \
        tini \
    # need build tools to compile gevent and greenlet
    # (just copying build-deps from python Dockerfile)
    && apk add --virtual .build-deps \
        bzip2-dev \
        coreutils \
        gcc \
        libc-dev \
        libffi-dev \
        libtirpc-dev \
        linux-headers \
        make \
        ncurses-dev \
        libressl \
        libressl-dev \
        pax-utils \
        readline-dev \
        xz-dev \
        zlib-dev \
    && pip install pipenv

COPY Pipfile Pipfile.lock /tmp/
RUN cd /tmp && pipenv install --system --deploy --verbose \
    && apk del .build-deps

COPY celeryconfig.py flowerconfig.py entrypoint.sh healthcheck.sh /opt/celery-flower/
WORKDIR /opt/celery-flower

EXPOSE 5555

USER nobody

ENTRYPOINT ["/sbin/tini", "--", "/opt/celery-flower/entrypoint.sh"]
