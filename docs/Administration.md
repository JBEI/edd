# Administration of EDD

## Common Maintenance/Development Tasks

Some of these sample commands will only work as written at JBEI, but should serve as useful
examples for common development tasks. Directions assume that Docker containers are already
running in the development environment.

### Run automated tests

Tests _must_ run with an `edd-core` image that is built with `TARGET=dev`.
This is the default when manually building, but is _not_ the default for
images pushed to Docker Hub. When the entire EDD stack is up and running,
execute the tests with this command:

```bash
docker compose exec http run_tests.sh
```

The `run_tests.sh` script is included in the `PATH` of the container running
the `http` service. The command is instructing the container for that service
to start a process for running the test suite and collecting the results.

### Test email configuration

Use the Django management command `sendtestemail` ([docs][1]) with this:

```bash
docker compose exec http /code/manage.py sendtestemail you@example.com
```

Similar to running the test suite, this command instructs the container for the
`http` service to start a process. Here, we're using Django's management
framework to use functionality provided by Django.

### Create an unprivileged test account

Use the Django management command `edd_create_user`, which is based on the
`createsuperuser` ([docs][2]) command. Instead of making a superuser, it creates
an unprivledged user, and auto-verifies that user's email address.

```bash
docker compose exec http /code/manage.py edd_create_user
```

### Dump and Restore database contents

Create a database dump and save it to a file using `pg_dump`. The command below
connects to the postgres server at `postgres.example.org` (`-h`), and the
database `edd` (`-d`), with the user/role `jane` (`-U`), and saves output
to the file `dump.sql` (`-f`).

```bash
pg_dump -h postgres.example.org -d edd -U jane -f dump.sql
```

!!! note "Postgres as a Container"

    If running with a Postgres container in your EDD stack, instead of an
    external database server, this dump file can be used to initialize the
    database. This should *only* be used for development.

    ```yaml
    postgres:
      environment:
        POSTGRES_DB: edd
        POSTGRES_USER: edduser
        POSTGRES_PASSWORD: ___
      image: library/postgres:14
      networks:
      - backnet
      volumes:
      - /path/to/dump.sql:/docker-entrypoint-initdb.d/000_dump.sql
    ```

### Rebuild Solr indices

Use the Django management command `edd_index`. Pass in the `--force` flag to
run a full re-index even if it appears each index contains the correct data.

```bash
docker compose exec http /code/manage.py edd_index
```

## Upgrading EDD

The simplest way to update EDD is to pull the newest image, then run
`docker compose up -d`. This will re-create containers using the new image.

---

[1]: https://docs.djangoproject.com/en/2.2/ref/django-admin/#sendtestemail
[2]: https://docs.djangoproject.com/en/2.2/ref/django-admin/#createsuperuser
