FROM library/python:3.7-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

WORKDIR /usr/local/edd-config

RUN set -ex \
    && apk update \
    # Adding some basic useful things
    && apk --update add --no-cache \
        bash \
        curl \
        git \
        netcat-openbsd \
    && apk add --virtual .build-deps \
        gcc \
        libc-dev \
        libffi-dev \
        libressl \
        libressl-dev \
        make \
    # grab yq binary
    && curl -fSL "https://github.com/mikefarah/yq/releases/download/2.4.0/yq_linux_amd64" \
        -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    # set up pipenv
    && pip install --no-cache-dir \
        docker-compose \
        pipenv

COPY Pipfile Pipfile.lock ./

# install Pipfile, remove build dependencies
RUN pipenv install --system --deploy --verbose \
    && apk del .build-deps

COPY . .

ENTRYPOINT ["invoke"]
CMD ["--help"]
