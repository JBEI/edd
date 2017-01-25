FROM buildpack-deps:stretch

MAINTAINER William Morrell "WCMorrell@lbl.gov"

RUN apt-get clean && apt-get update \
    && DEBIAN_FRONTENT=noninteractive apt-get install -y -q \
        exim4-daemon-light \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Add Tini
ENV TINI_VERSION v0.13.2
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

COPY entrypoint.sh healthcheck.sh /bin/

EXPOSE 25
ENTRYPOINT ["/tini", "--", "/bin/entrypoint.sh"]
CMD ["exim", "-bd", "-q15m", "-v"]
HEALTHCHECK --interval=1m --timeout=1s --retries=3 CMD /bin/healthcheck.sh localhost
