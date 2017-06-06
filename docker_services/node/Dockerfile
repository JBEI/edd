# https://github.com/dockerfile/nodejs-bower-grunt
#FROM digitallyseamless/nodejs-bower-grunt
FROM node

COPY package.json /node/
RUN npm install -g bower -g grunt-cli -g
ADD . /node

WORKDIR /node

CMD ["bash"]