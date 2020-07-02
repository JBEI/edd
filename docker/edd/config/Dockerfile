FROM library/python:3.8-slim-buster

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

WORKDIR /usr/local/edd-config

RUN set -ex \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade \
    && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
        bash \
        curl \
        git \
        netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    # grab yq binary
    && curl -fSL "https://github.com/mikefarah/yq/releases/download/2.4.1/yq_linux_amd64" \
        -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    # set up pipenv
    && pip install --no-cache-dir \
        docker-compose \
        pipenv

COPY Pipfile Pipfile.lock ./

# install Pipfile, remove build dependencies
RUN pipenv install --system --deploy --verbose

COPY . .

ENTRYPOINT ["invoke"]
CMD ["--help"]
