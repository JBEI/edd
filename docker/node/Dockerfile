FROM node:12-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY package.json /run/

WORKDIR /run/

RUN npm install --no-optional

CMD ["sh"]
