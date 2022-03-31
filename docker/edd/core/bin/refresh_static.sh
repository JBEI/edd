#!/bin/bash

set -euxo pipefail

python manage.py collectstatic \
    --noinput \
 && kill -s HUP 1
