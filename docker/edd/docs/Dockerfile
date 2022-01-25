FROM library/python:3.10-slim-bullseye as build

RUN pip install \
        mkdocs \
        mkdocs-bootswatch \
        pygments

WORKDIR /usr/local/edd

COPY . /usr/local/edd/

RUN mkdocs build

# -----

FROM nginx:mainline-alpine

COPY --from=build /usr/local/edd/site /usr/share/nginx/html
