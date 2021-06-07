#!/bin/bash

set -euxo pipefail

python manage.py collectstatic \
    --noinput \
    --settings "edd.settings.dev_collectstatic" \
 && kill -s HUP 1
