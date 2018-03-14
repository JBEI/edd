FROM jbei/edd-node:latest as node

# Copy in EDD code
ARG EDD_VERSION=2.2.0
ARG GIT_BRANCH=master
ARG GIT_URL=https://github.com/JBEI/edd.git
ENV EDD_VERSION="${EDD_VERSION}"
RUN apk add --no-cache git \
    && git clone --depth 1 -b "${GIT_BRANCH}" "${GIT_URL}" code \
    && echo "Cache-bust: ${EDD_VERSION}" \
    && cp ./code/docker_services/edd/tsconfig.json \
        ./code/docker_services/edd/webpack.config.js \
        . \
    && npm run build

# ---

FROM buildpack-deps:buster

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
WORKDIR /code
ARG EDD_VERSION=2.2.0
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8 EDD_VERSION="${EDD_VERSION}"

# include Debian packages required to build pip packages
RUN apt-get clean \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
        build-essential \
        g++ \
        gfortran \
        libatlas-base-dev \
        libbz2-dev \
        libffi-dev \
        liblapack-dev \
        libldap2-dev \
        libpq-dev \
        libsasl2-dev \
        libssl-dev \
        libyaml-dev \
        netcat \
        openssl \
        postgresql-client \
        python3-all-dev \
        python3-pip \
        python3-setuptools \
        python3-wheel \
    && apt-get autoremove -y \
    && ln -s /usr/bin/python3 /usr/local/bin/python \
    && ln -s /usr/bin/pip3 /usr/local/bin/pip \
    && pip install --no-cache-dir virtualenv \
    && rm -rf /var/lib/apt/lists/*

# COPY adds a new layer IFF requirements.txt hash has changed
COPY requirements.txt /tmp/

# Install remaining packages; numpy, scipy, scikit-learn will all be skipped as already-installed
RUN pip install -r /tmp/requirements.txt

# Add Tini
# Keep for now to maintain backward-compatibility; better to launch with docker run --init
ENV TINI_VERSION v0.16.1
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy in entrypoint shell scripts
COPY entrypoint.sh /usr/local/bin

# Copy in code from node image
COPY --from=node /code /usr/local/edd

ENTRYPOINT ["/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--help"]
