# Administration of EDD

## Common Maintenance/Development Tasks

Some of these sample commands will only work as written at JBEI, but should serve as useful
examples for common development tasks. Directions assume that Docker containers are already
running in the development environment.

* __Run automated tests__
    * Python tests: `docker-compose exec edd python manage.py test`
    * Javascript Tests <a name="Javascript Tests"/>
        * TODO: instructions on launching the node container
        * run `grunt test` to test javascript files.
        * run `grunt screenshots` to test graphs
        * run `webdriver-manager start` in one command window and `grunt e2e-test` in another for
          E2E tests

* __Test EDD/ICE communication__:
  `docker-compose exec edd /code/manage.py test_ice_communication`

* __Test email configuration__:
  `docker-compose exec edd /code/manage.py sendtestemail you@example.com`

* __Create an unprivileged test account__
  `docker-compose exec edd /code/manage.py edd_create_user`

* __Dump the production database to file and load into a local test deployment__
    * Create the dump file:

          pg_dump -h postgres.jbei.org -d eddprod -f edd-prod-dump.sql -U {your_username}

    * Load the dump file:
        * set the `POSTGRES_DUMP_FILE` environment for the `init` service in
          your `docker-compose.override.yml`
        * restart your containers

* __Rebuild Solr indexes:___
  `docker-compose exec edd /code/manage.py edd_index`


## Upgrading EDD

To upgrade EDD, perform the following simple steps. Some upgrades may not require all these steps,
but this is the safest upgrade process (though also the most time-consuming):

1. Schedule a downtime appropriate for your instance. The amount of time needed will vary based on
   the speed of backups and restores.
2. Update the `docker_services` directory to your desired version.
3. Pull or build the images with `docker-compose pull` or `docker-compose build`.
4. (optional, but recommended) Disable user access to EDD with `docker-compose down nginx`.
5. Make a backup of the database volume, using the `backup_volume.sh` script.
6. Restart the remaining containers with `docker-compose down` followed by `docker-compose up`.

To rollback a failed upgrade:

1. Stop the containers with `docker-compose down`.
2. Roll back the `docker_services` directory to its previous state.
3. Restore the database volume, using the `restore_volume.sh` script.
4. Start the containers with `docker-compose up`.
