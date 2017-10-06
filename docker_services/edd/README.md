# edd-core

This Dockerfile constructs the `edd-core` image for use in the [Experiment Data Depot][1]. The
image is based on [buildpack-deps:stretch][2], and includes the Python dependencies used by EDD
and clones the current `master` branch into the image. Build with:

    docker build -t yourorg/edd-core .

Build from alternate repositories and/or branches with build arguments `GIT_URL` and `GIT_BRANCH`,
for example:

    docker build -t yourorg/edd-core:1.0.0 \
        --build-arg "GIT_URL=https://git.example.org/repo/edd.git" \
        --build-arg "GIT_BRANCH=your-branch-name" \
        .

The image uses a custom entrypoint with commands for common tasks. Since EDD depends on multiple
services, the entrypoint ensures that all dependencies are up before proceeding. A full listing
of commands is provided below, or can be found by executing `docker run --rm -it edd-core --help`.

    Usage: entrypoint.sh [options] [--] command [arguments]
    Options:
        -h, --help
            Print this help message.
        -q, --quiet
            Silence output from this entrypoint script.
        -a, --init, --init-all
            Perform all initialization tasks prior to command start (default).
        -A, --no-init, --no-init-all
            Skip all initialization tasks; may override with another --init* flag.
        -s, --init-static
            Copy static files to the static volume. Only used to override -A.
        -S, --no-init-static
            Skip initialization of static files.
        -d, --init-database
            Initialize the database using POSTGRES_DUMP_URL or POSTGRES_DUMP_FILE
            environment. Only used to override -A.
        -D, --no-init-database
            Skip initialization of the database.
        -m, --init-migration
            Run any pending database migrations. Only used to override -A.
        -M, --no-init-migration
            Skip database migrations.
        -i, --init-index
            Re-index search prior to command. Only used to override -A.
        -I, --no-init-index
            Skip search re-indexing.
        --local file
            Copy the file specified to the local.py settings prior to launching the
            command. This option will be ignored if code is mounted to the container
            at /code.
        --force-index
            Force re-indexing; this option does not apply if -I is set.
        -w host, --wait-host host
            Wait for a host to begin responding before running commands. This option
            may be specified multiple times. The waits will occur in the
            order encountered.
        -p port, --wait-port port
            Only applies if -w is used. Specifies port to listen on. Defaults to
            port 24051. This option may be specified multiple times. The Nth port
            defined applies to the Nth host.
        --watch-static
            Watch for changes to static files, to copy to the static volume.

    Commands:
        application
            Start a Django webserver (gunicorn).
        devmode
            Start a Django webserver (manage.py runserver).
        init-only [port]
            Container will only perform selected init tasks. The service will begin
            listening on the specified port after init, default to port 24051.
        init-exit
            Container will only perform selected init tasks, then exit.
        test
            Execute the EDD unit tests.
        worker
            Start a Celery worker node.

To run a container without going through the entrypoint script, use a command similar to
`docker run --rm -it --entrypoint /bin/bash edd-core`.

---------------------------------------------------------------------------------------------------

[1]:    ../../README.md
[2]:    https://hub.docker.com/_/buildpack-deps/
