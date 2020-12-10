FROM node:lts-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY package.json /run/

WORKDIR /run/

RUN apk add --no-cache zsh \
 && yarn install --non-interactive --ignore-optional \
 && yarn cache clean

CMD ["/bin/zsh"]
