FROM library/postgres:9.6

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY healthcheck.sh /
COPY initdb/* /docker-entrypoint-initdb.d/

HEALTHCHECK \
    --interval=15s \
    --retries=4 \
    --start-period=15s \
    --timeout=5s \
    CMD /healthcheck.sh
