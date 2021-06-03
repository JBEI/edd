FROM library/python:3.8-slim-buster as build

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
