FROM debian:buster-slim as build

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
        mkdocs

WORKDIR /usr/local/edd

COPY . /usr/local/edd/

RUN mkdocs build

# -----

FROM nginx:mainline-alpine

COPY --from=build /usr/local/edd/site /usr/share/nginx/html
