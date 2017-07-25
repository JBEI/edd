FROM buildpack-deps:stretch

LABEL maintainer="William Morrell <WCMorrell@lbl.gov>"

ENV PYTHONUNBUFFERED 1
ENV LANG C.UTF-8

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y \
        netcat \
        python-all \
        python-all-dev \
        python-pip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ADD requirements.txt /tmp/
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r /tmp/requirements.txt

ADD celeryconfig.py flowerconfig.py entrypoint.sh healthcheck.sh /opt/celery-flower/
WORKDIR /opt/celery-flower

EXPOSE 5555

ENTRYPOINT ["/opt/celery-flower/entrypoint.sh"]
