FROM python:2.7

MAINTAINER William Morrell "WCMorrell@lbl.gov"

ENV PYTHONUNBUFFERED 1
RUN mkdir /code
WORKDIR /code

# configure apt sources
COPY docker_services/edd/apt-sources /etc/apt/sources.list.d/

# include Debian packages required to build pip packages
RUN printf 'APT::Default-Release "stable";' > /etc/apt/apt.conf.d/99defaultrelease \
    && apt-get update \
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
        postgresql-client \
    && apt-get -t testing install -y \
        python-sklearn \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Putting this in its own RUN to avoid needing to re-install numpy/scipy every time
# (since pip will update)
RUN pip install --upgrade pip setuptools wheel

# COPY adds a new layer IFF requirements.txt hash has changed
COPY requirements.txt /tmp/

# Install remaining packages; numpy, scipy, scikit-learn will all be skipped as already-installed
RUN pip install -r /tmp/requirements.txt
