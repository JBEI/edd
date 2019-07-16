FROM jwilder/docker-gen:latest

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

RUN set -ex \
    && apk update \
    && apk add --no-cache \
        bash \
        curl \
        jq

COPY nginx.tmpl /etc/docker-gen/templates/
COPY entrypoint.sh functions.sh reload-nginx.sh /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
