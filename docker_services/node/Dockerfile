# https://github.com/dockerfile/nodejs-bower-grunt
#FROM digitallyseamless/nodejs-bower-grunt
FROM node

MAINTAINER Traci Lopez "tlopez@lbl.gov"

COPY package.json /node/

WORKDIR /node

RUN npm install -g bower grunt-cli \
    && npm install

CMD ["bash"]