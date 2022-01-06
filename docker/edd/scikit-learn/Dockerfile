FROM library/python:3.8-slim-bullseye

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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && pip install \
        pipenv \
        python-libsbml \
        scikit-learn[alldeps]
