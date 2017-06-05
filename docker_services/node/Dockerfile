FROM digitallyseamless/nodejs-bower-grunt-runtime

COPY ./edd-django /src
WORKDIR /src
COPY ./edd-django/package.json /src/package.json
# Install Bower & Grunt
RUN npm install
ADD Gruntfile.js /src/Gruntfile.js
RUN grunt

ADD bower.json /src/bower.json
RUN bower install

# Define default command.
CMD ["bash"]
