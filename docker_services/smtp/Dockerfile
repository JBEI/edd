FROM buildpack-deps:stretch

MAINTAINER William Morrell "WCMorrell@lbl.gov"

RUN apt-get clean && apt-get update \
    && DEBIAN_FRONTENT=noninteractive apt-get install -y -q \
        exim4-daemon-light \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /bin/

EXPOSE 25
ENTRYPOINT ["/bin/entrypoint.sh"]
CMD ["exim", "-bd", "-q15m", "-v"]
