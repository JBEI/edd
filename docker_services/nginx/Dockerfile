FROM nginx:1.11

MAINTAINER William Morrell "WCMorrell@lbl.gov"

RUN apt-get clean && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
        curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin

COPY nginx.conf /usr/local/nginx/nginx.conf

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
