#!/bin/bash

# collectstatic to fill the staticdata volume
python /code/manage.py collectstatic --noinput

# wait a bit for postgres to start up
sleep 5

# run the database init script
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres template1 < /code/docker_services/postgres/init.sql

# run migrations
python /code/manage.py migrate

echo "********************************************************************************"
echo "* Initialization complete!                                                     *"
echo "* You may now ^C and/or docker-compose -f docker-init.yml down                 *"
echo "********************************************************************************"
