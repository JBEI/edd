## Common Maintenance/Development Tasks

Some of these sample commands will only work as written at JBEI, but should serve as useful
examples for common development tasks. Directions assume that Docker containers are already
running in the development environment.

* __Run automated tests__
    * Python tests: `docker-compose exec appserver python manage.py test`
    * Javascript Tests <a name="Javascript Tests"/>
        * run `grunt test` to test javascript files.
        * run `grunt screenshots` to test graphs
        * run `webdriver-manager start` in one command window and `grunt e2e-test` in another for
          E2E tests
    * Test EDD/ICE communication: `docker-compose exec appserver manage.py test_ice_communication`
    * Test email configuration
        * `python manage.py send_test_email your.email@somewhere.com`
        * `python manage.py sendtestemail --admins`
        * `python manage.py sendtestemail --managers`

* __Create an unprivileged test account__
    * `docker-compose exec appserver python manage.py edd_create_user`.

* __Dump the production database to file and load into a local test deployment__
    * Create the dump file

          pg_dump -h postgres.jbei.org -d eddprod -f edd-prod-dump.sql -U your_username'

    * Load the dump file by changing the `POSTGRES_DUMP_FILE` environment in your
      `docker-compose.override.yml` and restarting your containers.

* __Rebuild Solr indexes:___ `docker-compose exec edd manage.py edd_index`.

  This shouldn't normally be required, but can be helpful following unanticipated software errors.

* __Run development / maintenance level scripts__

  See [separate directions][1] for configuring a standalone Python environment to run these
  scripts, and for the list of available scripts.


## Upgrading EDD

To upgrade EDD, perform the following simple steps. Some upgrades may not require all these steps,
but this is the safest upgrade process (though also the most time-consuming):

1. Schedule a time for the upgrade when few or no users will be affected. At the time of writing,
   a successful build and migration/indexing processes may take upwards of 30-40 minutes, so leave
   some overhead and plan for EDD to be down for about an hour.
2. Make sure you're targeting the correct Docker machine. In the development example above, you
   would run:

      eval $(docker-machine env default)

3. Run `git status` and make a note of the result in case you need to abort the upgrade for any
   reason.
4. Get the latest code: `git checkout [branch]`.
5. Rebuild the Docker images. This step can often be skipped, but it's safest to execute it anyway
   in case EDD's dependencies have changed: `docker-compose build`. Rebuilding will go quickly in
   cases where there is little work to do. At other times this step may take upwards of 30 minutes,
   but is safe to perform while EDD's Docker containers are still runnning.
6. Stop the current instance and all supporting services: `docker-compose down`
7. Back up EDD's database in case of any unanticipated migration failures.
8. Restart EDD and supporting services. `docker-compose up -d`. This will take longer than normal
   following an upgrade, since Docker will automatically run any pending database migrations,
   relaunch the containers, and rebuild the SOLR indexes. You can watch the `appserver` container's
   log for a good overview of progress, e.g. `docker-compose logs -f appserver`
9. Log into the web interface and exercise a few features to confirm the upgrade was successful.

---------------------------------------------------------------------------------------------------

[1]:  ../jbei/README.md
