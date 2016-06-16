FROM python:2.7

MAINTAINER William Morrell "WCMorrell@lbl.gov"

ENV PYTHONUNBUFFERED 1

RUN pip install --upgrade pip setuptools wheel

ADD requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

ADD celeryconfig.py flowerconfig.py /opt/celery-flower/
WORKDIR /opt/celery-flower

EXPOSE 5555

ENTRYPOINT ["/usr/local/bin/celery"]
CMD ["--loglevel=info","-P", "gevent", "flower"]

