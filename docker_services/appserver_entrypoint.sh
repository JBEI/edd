#!/bin/bash

# Collect static first, worker will complain if favicons are missing
python /code/manage.py collectstatic --noinput

# Start up the application server
gunicorn -w 4 -b 0.0.0.0:8000 edd.wsgi:application
