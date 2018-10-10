FROM library/python:3.6-alpine3.8

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

WORKDIR /tmp

RUN set -ex \
    && apk update \
    # Adding some basic useful things for Docker, and OpenBLAS for Numpy stuff
    && apk --update add --no-cache \
        bash \
        curl \
        git \
        # libstdc++ needed for python-libsbml
        libstdc++ \
        netcat-openbsd \
        # OpenBLAS needed for Numpy
        openblas \
        postgresql-client \
        tini \
    # build tools to compile Numpy stuff
    && apk add --virtual .build-deps \
        g++ \
        gcc \
        libc-dev \
        libffi-dev \
        linux-headers \
        make \
        openblas-dev \
    # set up pipenv
    && pip install pipenv \
    # install NumPy
    # do this first and separate, to prevent delays with other packages failing without numpy
    && pip install numpy \
    # install SciPy
    && pip install scipy \
    # install scikit-learn
    && pip install scikit-learn[alldeps] \
    # also install python-libsbml because it otherwise takes several minutes every build
    && pip install python-libsbml \
    # remove build dependencies
    && apk del .build-deps
