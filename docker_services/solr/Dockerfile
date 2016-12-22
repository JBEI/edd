FROM solr:5.5

MAINTAINER William Morrell "WCMorrell@lbl.gov"

COPY entrypoint.sh /usr/local/bin

COPY cores /tmp/cores

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
