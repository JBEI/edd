FROM jbei/edd-node:latest as node

# Copy in EDD code
ARG EDD_VERSION=2.1.0
ARG GIT_BRANCH=master
ARG GIT_URL=https://github.com/JBEI/edd.git
ENV EDD_VERSION=${EDD_VERSION}
RUN git clone --depth 1 -b ${GIT_BRANCH} ${GIT_URL} edd

# Copy in javascript build instructions
COPY tsconfig.json webpack.config.js ./
RUN npm run build

# ---

FROM buildpack-deps:stretch

MAINTAINER William Morrell "WCMorrell@lbl.gov"
WORKDIR /code

ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

# include Debian packages required to build pip packages
RUN apt-get clean && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
        build-essential \
        g++ \
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

# Add Tini
ENV TINI_VERSION v0.13.2
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy in entrypoint shell scripts
COPY entrypoint.sh /usr/local/bin

# Copy in code from node image
COPY --from=node /node/edd /usr/local/edd

ENTRYPOINT ["/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--help"]
