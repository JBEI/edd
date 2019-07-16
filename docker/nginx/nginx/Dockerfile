FROM library/nginx:mainline-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

RUN set -ex \
    # update package index from base file
    && apk update \
    # image needs netcat to run healthcheck
    && apk --update add --no-cache netcat-openbsd

COPY test_and_reload.sh /usr/local/bin/

HEALTHCHECK \
    --interval=15s \
    --retries=4 \
    --timeout=5s \
    CMD nc -z localhost 80 || exit 1
