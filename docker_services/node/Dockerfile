# https://github.com/dockerfile/nodejs-bower-grunt
#FROM digitallyseamless/nodejs-bower-grunt
FROM node

MAINTAINER Traci Lopez "tlopez@lbl.gov"

COPY package.json /

WORKDIR /

RUN npm install -g webpack \
    && npm install

CMD ["bash"]
