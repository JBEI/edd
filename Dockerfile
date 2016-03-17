FROM python:2.7

ENV PYTHONBUFFERED 1
RUN mkdir /code
WORKDIR /code

# include Debian packages required to build pip packages
RUN apt-get update \
&& apt-get install -y \
    gfortran \
    libatlas-dev \
    libbz2-dev \
    libffi-dev \
    liblapack-dev \
    libldap2-dev \
    libpq-dev \
    libsasl2-dev \
    libssl-dev \
    postgresql-client \
&& apt-get autoremove \
&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt /code/
RUN pip install -r requirements.txt

COPY . /code/

RUN python manage.py collectstatic -v 0 --clear --noinput
