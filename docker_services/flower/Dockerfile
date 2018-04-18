FROM library/python:3.6-alpine3.7

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

RUN set -ex \
    # update package index from base file
    && apk update \
    # image needs netcat
    && apk --update add --no-cache netcat-openbsd \
    # need build tools to compile gevent and greenlet
    # (just copying build-deps from python Dockerfile)
    && apk add --virtual .build-deps \
        bzip2-dev \
        coreutils \
        dpkg-dev dpkg \
        expat-dev \
        gcc \
        gdbm-dev \
        libc-dev \
        libffi-dev \
        libnsl-dev \
        libtirpc-dev \
        linux-headers \
        make \
        ncurses-dev \
        libressl \
        libressl-dev \
        pax-utils \
        readline-dev \
        sqlite-dev \
        tcl-dev \
        tk \
        tk-dev \
        xz-dev \
        zlib-dev

ADD requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt \
    && apk del .build-deps

ADD celeryconfig.py flowerconfig.py entrypoint.sh healthcheck.sh /opt/celery-flower/
WORKDIR /opt/celery-flower

EXPOSE 5555

ENTRYPOINT ["/opt/celery-flower/entrypoint.sh"]
