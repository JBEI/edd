# edd-core

This Dockerfile constructs the `edd-core` image for use in the
[Experiment Data Depot][1]. The image ultimately tagged as `edd-core` is an
Alpine Linux environment with Python 3 and the Python dependencies used by EDD
installed, and a cloned copy of the EDD code. Build from the repository root:

    DOCKER_BUILDKIT=1 docker build \
      -t yourorg/edd-core \
      -f docker/edd/core/Dockerfile \
      .

Specify a version number for the build with build argument `EDD_VERSION`:

    DOCKER_BUILDKIT=1 docker build \
      -t yourorg/edd-core:1.0.0 \
      -f docker/edd/core/Dockerfile \
      --build-arg "EDD_VERSION=1.0.0" \
      .

Toggle between testing and production builds with build argument `TARGET`. The
default is a testing build, with valid values being `dev` or `prod`:

    DOCKER_BUILDKIT=1 docker build \
      -t yourorg/edd-core:1.0.0 \
      -f docker/edd/core/Dockerfile \
      --build-arg "EDD_VERSION=1.0.0" \
      --build-arg "TARGET=prod" \
      .

The image sets an entrypoint script using [Invoke][2]. This entrypoint ensures
that a container has all prerequisite configuration and services available for
the EDD code to work before proceeding. A full listing of commands is provided
below, or can be found by executing `docker run --rm -it edd-core`.

    Available tasks:

      celery               Executes EDD as a Celery worker.
      daphne               Executes EDD as a Channels application with Daphne.
      gunicorn             Executes EDD as a Django site with Gunicorn.
      watch-static         Watches for changes to static assets in background.
      prereq.code          Checks that code is in place for execution.
      prereq.environment   Checks that expected environment variables are set.
      prereq.errorpage     Renders a static version of the Django error page.
      prereq.local         Checks that a local.py settings override file is in place.
      prereq.migrations    Migrates the database to the current version.
      prereq.owner         Sets ownership on necessary directories.
      prereq.postgres      Waits for the Postgres service to begin responding to connections.
      prereq.rabbitmq      Waits for the RabbitMQ service to begin responding to connections.
      prereq.redis         Waits for the Redis service to begin responding to connections.
      prereq.solr          Waits for the Solr service to begin responding to connections.
      prereq.staticfiles   Initializes static assets.

To run a container without going through the entrypoint script, use a command
similar to:

    docker run --rm -it --entrypoint /bin/bash edd-core

---

[1]: ../../README.md
[2]: http://docs.pyinvoke.org/en/stable/
