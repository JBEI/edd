FROM node:8.9-alpine

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

COPY package.json /

WORKDIR /

RUN npm install --no-optional

CMD ["bash"]
