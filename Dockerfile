FROM python:2.7

ENV PYTHONBUFFERED 1
RUN mkdir /code
WORKDIR /code

ADD requirements.txt /code/
RUN pip install -r requirements.txt

ADD . /code/

RUN python manage.py collectstatic -v 0 --clear --noinput
