FROM buildpack-deps:stretch

MAINTAINER William Morrell "WCMorrell@lbl.gov"

ENV PYTHONUNBUFFERED 1
ENV LANG C.UTF-8
ENV DOCKERIZE_VERSION v0.2.0

RUN apt-get update \
    && apt-get install -y \
        python-all \
        python-all-dev \
        python-pip \
        wget \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz

RUN pip install --upgrade pip setuptools wheel && pip install --no-cache-dir virtualenv

ADD requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

ADD celeryconfig.py flowerconfig.py /opt/celery-flower/
WORKDIR /opt/celery-flower

EXPOSE 5555

CMD ["dockerize", "-wait", "tcp://rabbitmq:5672", "-timeout", "1m", "/usr/local/bin/celery", "--loglevel=info","-P", "gevent", "flower"]

