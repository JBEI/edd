FROM python:2.7

ENV PYTHONBUFFERED 1
RUN mkdir /code
WORKDIR /code

# include Debian packages required to build pip packages
RUN apt-get update
RUN apt-get -y install libpq-dev postgresql-client libldap2-dev libsasl2-dev libssl-dev libffi-dev libatlas-dev liblapack-dev gfortran libbz2-dev

ADD requirements.txt /code/
RUN pip install -r requirements.txt

ADD . /code/

RUN python manage.py collectstatic -v 0 --clear --noinput
