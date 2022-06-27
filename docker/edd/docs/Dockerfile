FROM library/python:3.10-slim-bullseye as build

RUN pip install \
        mkdocs \
        mkdocs-bootswatch \
        pygments \
        pymdown-extensions

WORKDIR /usr/local/edd

COPY . /usr/local/edd/

RUN mkdir -p /usr/local/css \
 && pygmentize -f html -S friendly -a .highlight > /usr/local/css/pygments.css \
 && mkdocs build

# -----

FROM nginx:mainline-alpine

COPY --from=build /usr/local/edd/site /usr/share/nginx/html
COPY --from=build /usr/local/css /usr/share/nginx/html/css
