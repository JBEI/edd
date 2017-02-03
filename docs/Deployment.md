# Deploying EDD

## Pre-requisites

Have [Docker][1] and [Docker Compose][2] installed on the target host. Also have the contents of
the `docker_services` directory of the EDD codebase copied to the target host.

## Building EDD

Before starting a deployment, it is necessary to "build" the images used to create the various
Docker containers. This can be accomplished either by pulling already-built images from a Docker
Registry, or running the `docker-compose build` command to create images from the
included `Dockerfile`s.

## Initial configuration

There are many configuration options that can be set before launching EDD. The `init-config.sh`
script handles creating two files based on included example files:

  * __`secrets.env`__: Contains environment variables loaded into containers at launch; these
    values will generally be passwords, keys, and other secret information.
  * __`docker-compose.override.yml`__: Overrides the default configuration used to launch the
    Docker containers. Non-secret environment, and other launch options will be put into this file.

More information and examples can be found in the example files, and copied into the files created
by the `init-config.sh` script.

The `init-config.sh` script can also optionally take a `--project NAME` argument, and will attempt
to create a virtualenv with `virtualenvwrapper`, and set the `COMPOSE_PROJECT_NAME` environment
when the virtualenv is activated. This is useful to have the Docker containers started by Compose
have a prefix other than `dockerservices`. It will also allow `workon NAME` to take you directly
to the `docker_services` directory of the deployment.

## TLS configuration

The included Nginx image will look for TLS-related files mounted to `/var/edd/ssl/` in the nginx
service container on each startup. If it finds the files named below, it copies those files to a
data volume for use in future launches.

  * `dhparam.pem`: A parameter key for generating Diffie-Hellman ephemeral keys. Used by the
    `ssl_dhparam` configuration in Nginx ([documentation][3]).
  * `certificate.chained.crt`: The server certificate, plus any intermediate certificates used to
    sign the server certificate between the trusted root certificate. Used by the `ssl_certificate`
    configuration in Nginx ([documentation][4]).
  * `certificate.key`: The private key corresponding to the server certificate. Used by the
    `ssl_certificate_key` configuration in Nginx ([documentation][5]).
  * `trustchain.crt`: The trustchain between the server certificate and the trusted root
    certificate for use in OSCP stapling. The contents of this file will be the same intermediate
    certificates included in `certificate.chained.crt`. Used by the `ssl_trusted_certificate`
    configuration in Nginx ([documentation][6]).

If alternate TLS configuration -- or any other Nginx configuration -- is desired, replace the
default `nginx` service image with one containing options for your alternate configuration.

## Custom Python configuration

The following configuration options are specific to EDD and may be overridden in a `local.py`.

  * `EDD_DEPLOYMENT_ENVIRONMENT`
  * `REQUIRE_UNIPROT_ACCESSION_IDS`
  * `PUBLISH_REST_API`
  * `ICE_KEY_ID`
  * `ICE_SECRET_HMAC_KEY`
  * `ICE_URL`
  * `ICE_REQUEST_TIMEOUT`
  * `TYPICAL_ICE_PART_NUMBER_PATTERN`
  * `VERIFY_ICE_CERT`
  * `EDD_MAIN_SOLR`
  * `EDD_LATEST_CACHE`
  * `USE_CELERY`
  * `EDD_ONLY_SUPERUSER_CREATE`
  * `EDD_ICE_FAIL_MODE`

## Entrypoint options

The entrypoint script for the `edd-core` image uses this approximate workflow:

  * Load custom `local.py`
  * Wait on custom service dependencies (if any)
  * Wait on redis
  * Initialize static files
  * Wait on postgres
  * Create and/or restore database
  * Wait on solr
  * Run pending database migrations (if any)
  * Re-index solr (if any changes made to database)
  * Wait on rabbitmq
  * Execute entrypoint command

The entrypoint workflow can be modified with the flags defined below. This output can be recreated
with `docker-compose exec edd entrypoint.sh --help`.

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

    Commands:
        application
            Start a Django webserver (gunicorn).
        devmode
            Start a Django webserver (manage.py runserver).
        init-only [port]
            Container will only perform selected init tasks. The service will begin
            listening on the specified port after init, default to port 24051.
        test
            Execute the EDD unit tests.
        worker
            Start a Celery worker node.


## Starting EDD

Once configured, EDD is launched with a simple command, `docker-compose up -d`. To stop EDD, run
`docker-compose down`.

---------------------------------------------------------------------------------------------------

[1]:    https://docker.io/
[2]:    https://docs.docker.com/compose/overview/
[3]:    http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_dhparam
[4]:    http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_certificate
[5]:    http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_certificate_key
[6]:    http://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_trusted_certificate
