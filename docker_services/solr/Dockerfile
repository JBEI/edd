FROM solr:5.5

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

# Add Tini
ENV TINI_VERSION v0.13.2
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
USER root
RUN chmod +x /tini
USER $SOLR_USER

COPY entrypoint.sh healthcheck.sh /usr/local/bin/

COPY cores /tmp/cores

ENTRYPOINT ["/tini", "--", "/usr/local/bin/entrypoint.sh"]
HEALTHCHECK --interval=1m --timeout=10s --retries=3 CMD /usr/local/bin/healthcheck.sh
