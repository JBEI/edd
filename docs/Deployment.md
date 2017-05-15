# Deploying EDD

## Pre-requisites

Have [Docker][1] and [Docker Compose][2] installed on the target host. Also have the contents of
the `docker_services` directory of the EDD codebase copied to the target host.

## Initial configuration

There are many configuration options that can be set before launching EDD. The `init-config`
script handles creating two files based on included example files:

  * __`secrets.env`__: Contains environment variables loaded into containers at launch; these
    values will generally be passwords, keys, and other secret information.
  * __`docker-compose.override.yml`__: Overrides the default configuration used to launch the
    Docker containers. Non-secret environment, and other launch options will be put into this file.

More information and example configuration options can be found in the example files, and copied
into the files created automatically by the `init-config` script.

The `init-config` script can also optionally take a `--project NAME` argument, and will attempt
to create a virtualenv with `virtualenvwrapper`, and set the `COMPOSE_PROJECT_NAME` environment
when the virtualenv is activated. This is useful to have the Docker containers started by Compose
have a prefix other than `dockerservices`. It will also allow `workon NAME` to take you directly
to the `docker_services` directory of the deployment. Using this option will allow for a workflow
similar to the following:

    . init-config --project edd
    ./start-edd.sh
    # use EDD for some time
    ./stop-edd.sh
    deactivate
    # do other terminal work
    # ... two weeks later ...
    workon edd
    # terminal is now in the docker_services directory
    ./start-edd.sh
    # use EDD for some time

## Building EDD

Before starting a deployment, the Docker images used by the various EDD services must be present
on the host computer. This is accomplished either by pulling already-built images from a Docker
Registry, or running the `docker-compose build` command to create images from the
included `Dockerfile`s.

## TLS and domain configuration

EDD includes a set of Docker containers to auto-configure an [Nginx][3] webserver with TLS
encryption via certificates generated with the [Let's Encrypt][4] service. By setting some
environment in the `edd` service container, EDD will generate a configuration file for Nginx to
proxy HTTP requests and secure connections with TLS.

To proxy requests to a container, set the environment variables `VIRTUAL_HOST`, `VIRTUAL_NETWORK`,
and `VIRTUAL_PORT` on that container. The values of these variables are the DNS hostname, the
Docker virtual network name, and the IP network port exposed on the container, respectively. These
values are set automatically for the central EDD service by the `init-config` script, but only for
local connections. To use your own domain, append your domain to the comma-separated list in
`VIRTUAL_HOST` in the `docker-compose.override.yml`.

Adding TLS encryption requires setting a few more variables: `LETSENCRYPT_HOST` and
`LETSENCRYPT_EMAIL`. These are used as parameters to the scripts using the Let's Encrypt APIs. The
included Docker containers handle taking these values, performing the handshake with Let's Encrypt,
installing the certificates in Nginx configuration, and refreshing the certificates before they
expire.

If alternate TLS configuration -- or any other Nginx configuration -- is desired, replace the
default `nginx` service image with one containing options for your alternate configuration, or
re-write the `nginx.tmpl` template.

## Linking to an ICE server

The purpose of EDD is to store actionable datasets in synthetic biology engineering. An important
piece of information in understanding this data is the genetic sequences of engineered organisms.
The EDD uses another piece of JBEI software, the Inventory of Composable Elements, or ICE, to keep
track of this information. Any functionality on EDD that deals with linking to strains will not
work unless the EDD server is connected to an ICE server.

To link to an ICE server, EDD uses a Base64-encoded key. Create a key using a command like this:

    openssl rand -base64 64 | tr -d '\n' > hmac.key

This will create a file named `hmac.key`. Copy the contents of this file and add it to the line
setting `ICE_HMAC_KEY` in your `secrets.env`. Then, copy this file to your ICE server, and place it
in a file named `edd` in the `rest-auth` directory of the ICE home directory.

## Creating an EDD administrator account

Several parts of EDD's configuration is contained within the running application's database,
instead of loaded from files at startup. A login account to the EDD application, with access to
the administration interface, is the easiest way to edit this configuration. To create an
administrator account, run this command from the `docker_services` directory, after EDD has
finished startup:

    docker-compose exec edd /code/manage.py createsuperuser

The command will prompt for a username, email address, and password. Logging in with the username
and password combination will send a confirmation email to the provided address. Once the email
is validated, the account is active and an "Administration" link to the EDD will appear on every
page, which will load the administration interface when clicked.

## Customization of EDD

Inside the administration interface, a few items should be modified prior to serious use of the
application.

1. Set the site name and domain in __Sites__. The default confirmation email will use `example.com`
   as the name of the EDD site, because that is the default value set in the Sites admin. Click
   through to __Sites__, and then through to __example.com__ to edit the name and domain to match
   your deployment.
2. Set __Brandings__ to use. This admin section sets the logo, favicon, and custom stylesheets
   used in EDD. Click through to __Add Branding__ to upload these custom files and associate them
   with the default site set in the previous step.
3. Create __Flat pages__. These are simple text pages to display in EDD. Here is where you can
   add pages containing information like Privacy Policies, Terms of Service, etc.
4. Add __Social applications__. This section is where you can configure logins using OAuth from
   other services, such as Google, LinkedIn, etc. This will also require changes to `local.py` to
   add the Django apps for each login provider. See the [django-allauth documentation][5] for more
   details.

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

Once configured, EDD is launched with a simple command, `./start-edd.sh`. To stop EDD, run
`./stop-edd.sh`.

---------------------------------------------------------------------------------------------------

[1]:    https://docker.io/
[2]:    https://docs.docker.com/compose/overview/
[3]:    https://nginx.org/en/docs/
[4]:    https://letsencrypt.org/about/
[5]:    http://django-allauth.readthedocs.org/en/latest/index.html
