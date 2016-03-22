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
&& apt-get autoremove -y \
&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt /code/
# Putting this in its own RUN to avoid needing to re-install numpy/scipy every time
# (since pip will update)
RUN pip install --upgrade pip setuptools wheel
# Bug in scipy and scikit-learn setup.py requires that numpy and scipy be installed in separate
#   invokations of pip install.
RUN pip install numpy==1.10.4 \
&& pip install scipy==0.17.0 \
&& pip install -r requirements.txt

# TODO could reduce this down to copying ./edd ./edd_utils ./jbei ./main ?
COPY . /code/

RUN python manage.py collectstatic -v 0 --clear --noinput
