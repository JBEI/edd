FROM buildpack-deps:stretch

MAINTAINER William Morrell "WCMorrell@lbl.gov"

ENV PYTHONUNBUFFERED 1
ENV LANG C.UTF-8
RUN mkdir /code
WORKDIR /code

# include Debian packages required to build pip packages
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y \
        gfortran \
        libatlas-dev \
        libbz2-dev \
        libffi-dev \
        liblapack-dev \
        libldap2-dev \
        libpq-dev \
        libsasl2-dev \
        libssl-dev \
        netcat \
        postgresql-client \
        python-all \
        python-all-dev \
        python-pip \
        python-sklearn \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Putting this in its own RUN to avoid needing to re-install numpy/scipy every time
# (since pip will update)
RUN pip install --upgrade pip setuptools wheel && pip install --no-cache-dir virtualenv

# COPY adds a new layer IFF requirements.txt hash has changed
COPY requirements.txt /tmp/

# Install remaining packages; numpy, scipy, scikit-learn will all be skipped as already-installed
RUN pip install -r /tmp/requirements.txt
