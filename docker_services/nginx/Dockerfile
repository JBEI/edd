FROM nginx:1.9

MAINTAINER William Morrell "WCMorrell@lbl.gov"

RUN apt-get update \
    && apt-get install -y \
        nginx-extras \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ADD nginx.conf /etc/nginx/
