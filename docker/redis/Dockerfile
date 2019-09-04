FROM library/redis:5-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

ADD healthcheck.sh /

HEALTHCHECK \
    --interval=15s \
    --retries=3 \
    --start-period=15s \
    --timeout=5s \
    CMD /healthcheck.sh
