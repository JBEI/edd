FROM library/solr:8

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY entrypoint.sh /
COPY configsets/ /opt/solr/configset.d/

HEALTHCHECK \
    --interval=60s \
    --retries=4 \
    --timeout=15s \
    CMD curl -fsSL http://localhost:8983/solr/admin/info/system | grep '"status":0,' || exit 1

ENTRYPOINT ["/entrypoint.sh"]
