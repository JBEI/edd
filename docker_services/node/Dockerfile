# https://github.com/dockerfile/nodejs-bower-grunt
#FROM digitallyseamless/nodejs-bower-grunt
FROM edd-node

ONBUILD COPY package.json /node/
ONBUILD RUN npm install
ONBUILD RUN npm install grunt-cli --save
ONBUILD RUN npm install bower --save
ONBUILD COPY bower.json /node/
ONBUILD RUN bower install --save
ONBUILD ADD . /node

WORKDIR /node

CMD ["bash"]