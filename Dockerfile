# arguments and defaults used with docker build command
ARG EDD_VERSION="manual-build"
ARG TARGET="dev"

# ---

FROM node:lts-alpine as edd-node

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY ./package.json /run/package.json

WORKDIR /run/

RUN apk add --no-cache zsh

CMD ["/bin/zsh"]

# ---

FROM oven/bun as edd-bun
LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
COPY ./package.json /home/bun/app/package.json
WORKDIR /home/bun/app
RUN bun install --non-interactive --ignore-optional

# ---

FROM oven/bun as edd-bun-bs5
LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
COPY ./package.bs5.json /home/bun/app/package.json
WORKDIR /home/bun/app
RUN bun install --non-interactive --ignore-optional

# ---

FROM library/python:3.12-slim-bookworm as pybase

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ENV PYTHONUNBUFFERED=1 LANG=C.UTF-8

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
 && python -m ensurepip --upgrade \
 && python -m pip install --upgrade pip setuptools wheel \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM pybase as setup

WORKDIR /usr/local/edd-config

RUN set -ex \
 # grab yq binary
 && curl -fSL "https://github.com/mikefarah/yq/releases/download/2.4.1/yq_linux_amd64" \
    -o /usr/local/bin/yq \
 && chmod +x /usr/local/bin/yq \
 # install invoke
 && pip install --no-cache-dir invoke \
 && rm -rf /root/.cache \
 && find /usr/local/lib/ -name __pycache__ | xargs rm -rf

COPY ./setup/ /usr/local/edd-config

ENTRYPOINT ["invoke"]
CMD ["--help"]

# ---

FROM pybase as generate-requirements

WORKDIR /install

RUN set -ex \
# install pipx and poetry
 && python -m pip install pipx \
 && pipx install poetry \
# warnings say the export sub-command is moving to a plugin and will not be installed by default
 && pipx inject poetry poetry-plugin-export \
# ... but, installing the plugin doesn't disable the warning, so need this
 && poetry config warnings.export false

# ---

FROM pybase as preinstall
ARG TARGET

WORKDIR /install

COPY ./requirements.* /install/
COPY ./container-bin/* /usr/local/bin/

RUN set -ex \
# update package index from base file
 && apt-get update \
# need build tools to compile some python packages
 && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
    build-essential \
    libldap2-dev \
    libsasl2-dev \
# install EDD dependencies
 && if [ "${TARGET}" = "dev" ]; \
    then python -m pip install -r requirements.dev.txt; \
    else python -m pip install -r requirements.txt; \
    fi \
# remove build tools
 && DEBIAN_FRONTEND=noninteractive apt-get -y purge \
    build-essential \
    libldap2-dev \
    libsasl2-dev \
# cleanup apt
 && apt autoremove -y \
 && apt-get clean \
# cleanup pip
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /root/.cache

# ---

FROM library/python:3.12-slim-bookworm as docs-build

WORKDIR /usr/local/edd
COPY . /usr/local/edd/

RUN python -m pip install -r mkdocs.requirements.txt \
 && mkdir -p /usr/local/css \
 && pygmentize -f html -S friendly -a .highlight > /usr/local/css/pygments.css \
 && mkdocs build

# -----

FROM nginx:mainline-alpine as docs

COPY --from=docs-build /usr/local/edd/site /usr/share/nginx/html
COPY --from=docs-build /usr/local/css /usr/share/nginx/html/css

# ---

FROM edd-node as typescript

WORKDIR /run/
COPY ./typescript ./.prettierrc.js /run/
COPY --from=edd-bun /home/bun/app/node_modules /run/node_modules

# build & test the TypeScript code
RUN ls -al && yarn build

# ---

FROM edd-node as typescript-bs5

WORKDIR /run/
COPY ./typescript-bs5 ./.prettierrc.js /run/
COPY --from=edd-bun-bs5 /home/bun/app/node_modules /run/node_modules

# build & test the TypeScript code
RUN ls -al && yarn build

# ---

FROM preinstall as configure

WORKDIR /tmp/
COPY ./.git /tmp/.git

RUN git rev-parse --short HEAD > /tmp/edd.hash

# ---

FROM preinstall as staticfiles

WORKDIR /usr/local/edd
# Copy in python code
COPY ./server /usr/local/edd
# Copy in commit hash from configure image
COPY --from=configure /tmp/edd.hash /edd.hash

RUN EDD_DEBUG="$([ "${TARGET}" != "dev" ] || echo "True")" \
    python manage.py collectstatic \
      --noinput \
      --no-post-process \
      --settings "edd.settings.build_collectstatic" \
 && find /usr/local/edd/ -type d -name static -exec rm -rf \{\} \+ \
 && find /usr/local/edd/ -type d -name __pycache__ -exec rm -rf \{\} \+

# ---

FROM preinstall as install

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"
ARG EDD_VERSION

ENV EDD_VERSION="${EDD_VERSION}"
WORKDIR /code

# Copy in invoke config
COPY ./invoke.yaml /etc/invoke.yaml
# Copy in invoke scripts
COPY ./startup-tasks /usr/local/edd-invoke/tasks
# Copy in entrypoint
COPY ./entrypoint.sh /usr/local/bin/entrypoint.sh
# Copy in python code
COPY --from=staticfiles /usr/local/edd /usr/local/edd
# Copy in static assets
COPY --from=staticfiles /usr/local/edd-static /usr/local/edd-static
COPY --from=typescript /run/dist /usr/local/edd-static/dist
COPY --from=typescript-bs5 /run/dist /usr/local/edd-static/bs5
# Copy in commit hash from configure image
COPY --from=configure /tmp/edd.hash /edd.hash

# Create user/group to run code
RUN addgroup --gid 1000 --system edduser \
 && adduser --uid 1000 --system edduser --gid 1000 \
# create log directory
 && mkdir -p /var/log/edd

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["--list"]
