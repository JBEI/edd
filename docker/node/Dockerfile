FROM node:12-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY package.json /run/

WORKDIR /run/

RUN yarn install --non-interactive --ignore-optional \
 && yarn cache clean

CMD ["sh"]
