FROM helder/docker-gen:latest

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY nginx.tmpl /etc/docker-gen/templates/
COPY entrypoint.sh /

ENTRYPOINT ["/entrypoint.sh"]
