FROM library/rabbitmq:3.7-management-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

ADD healthcheck.sh /

HEALTHCHECK \
    --interval=1m \
    --retries=3 \
    --start-period=1m \
    --timeout=30s \
    CMD /healthcheck.sh
