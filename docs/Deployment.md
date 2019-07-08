# Deploying EDD

## Pre-requisites

Have [Docker][1] and [Docker Compose][2] installed on the target host. EDD is tested with Docker
version 18.09.2 and Docker Compose version 1.23.2; these instructions are not guaranteed to
work for any older versions of Docker or Docker Compose. Also have at least the `bin` and `docker`
directories, along with `docker-compose.yml` and `docker-compose.override.yml-example` copied to
the target host.

## Initial configuration

There are many configuration options that can be set before launching EDD. The `init-config`
script handles creating additional options based on included example files:

  * __`secrets`__: Directory contains secret values loaded into containers at launch; these
    values will generally be passwords, keys, and other secret information.
  * __`docker-compose.override.yml`__: Overrides the default configuration used to launch the
    Docker containers. Non-secret environment, and other launch options will be put into this file.

More information and example configuration options can be found in the example files, and copied
into the files created automatically by the `init-config` script.

## Building EDD

Before starting a deployment, the Docker images used by the various EDD services must be present
on the host computer. This is accomplished either by pulling already-built images from a Docker
Registry, or building the images from the Dockerfiles included in the project. To pull the images,
use `docker-compose pull`. To build the images _with default parameters_, run
`docker-compose build`. Customizing builds is beyond the scope of this document, consult the
individual README files included with each Dockerfile if a custom build is required.

## TLS and domain configuration

EDD includes a set of Docker containers to auto-configure an [Nginx][3] webserver with TLS
encryption via certificates generated with the [Let's Encrypt][4] service. By setting some
environment in the `edd` service container, EDD will generate a configuration file for Nginx to
proxy HTTP requests and secure connections with TLS.

To proxy requests to a container, set the environment variables `VIRTUAL_HOST` and `VIRTUAL_PORT`
on that container. The values of these variables are the DNS hostname, and the port exposed on the
container, respectively. These values are set automatically for the central EDD service by the
`init-config` script, but only for a single domain, via the `--domain` option. For more advanced
configuration, consult the documentation for the [`letsencrypt-nginx-proxy-compainion`][6].

If alternate TLS configuration -- or any other Nginx configuration -- is desired, replace the
default `nginx` service image with one containing options for your alternate configuration, or
re-write the `nginx.tmpl` template.

## Linking to an ICE server

The purpose of EDD is to store actionable datasets in synthetic biology engineering. An important
piece of information in understanding this data is the genetic sequences of engineered organisms.
The EDD uses another piece of JBEI software, the [Inventory of Composable Elements][7], or ICE, to
keep track of this information. Any functionality on EDD that deals with linking to strains will
not work unless the EDD server is connected to an ICE server.

To link to an ICE server, EDD uses a Base64-encoded key. Create a key using a command like this:

    openssl rand -base64 64 | tr -d '\n' > hmac.key

This will create a file named `hmac.key`. Copy this file to the `secrets` directory, and add a
secret to the `docker-compose.override.yml` configuration for the services using `edd-core` and
`ice`. The `edd-core` image will check for a secret named `edd_ice_key`, and the `ice` image will
load in HMAC keys using the value of the `ICE_HMAC_SECRETS` environment.

## Creating an EDD administrator account

Several parts of EDD's configuration is contained within the running application's database,
instead of loaded from files at startup. A login account to the EDD application, with access to
the administration interface, is the easiest way to edit this configuration. To create an
administrator account, run this command inside the `edd` service, after EDD has
finished startup:

    python manage.py createsuperuser

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

  * `EDD_ALLOW_SIGNUP` -- boolean flag; if True, self-registration of accounts is enabled.
  * `EDD_DEPLOYMENT_ENVIRONMENT` -- string value, changes background color and adds a visual
    environment label to assist in telling apart testing vs production instances. A None value
    will result in no visual changes added to the interface.
  * `EDD_ENABLE_GRAPHQL` -- boolean flag; if True, publish a GraphQL endpoint for EDD.
  * `EDD_EXTERNAL_SCRIPTS` -- iterable of URL strings; these will be scripts added to the default
    EDD page template. Put links for any external scripts here, to avoid creating custom
    HTML templates.
  * `EDD_LATEST_CACHE` -- string value; the name of the Django cache to use for storing a user's
    latest viewed studies.
  * `EDD_ONLY_SUPERUSER_CREATE` -- boolean flag; if True, only superuser accounts may create
    new studies.
  * `ICE_KEY_ID` -- string value, the identifier of the shared key used to communicate with ICE.
  * `ICE_SECRET_HMAC_KEY` -- string value, base64-encoded key used to sign requests to ICE.
  * `ICE_URL` -- URL of the ICE instance associated with EDD.
  * `ICE_REQUEST_TIMEOUT` -- 2-tuple of integers, for the seconds to set connection and read
    timeouts in communication with ICE.
  * `ICE_VERIFY_CERT` -- boolean flag; if True, use strict certificate verification when
    connecting to ICE. _Note_: older versions of EDD used the name `VERIFY_ICE_CERT` instead. EDD
    will check for this name and emit a warning; the old name will be removed at a future date.
  * `REQUIRE_UNIPROT_ACCESSION_IDS` -- boolean flag; if True, protein measurement IDs must conform
    to the pattern of UniProt identifiers. Otherwise, arbitrary text may label a protein.

## Entrypoint options

The entrypoint script for the `edd-core` image uses this approximate workflow:

  1. Load custom `local.py`
  2. Wait on custom service dependencies (if any, none by default)
  3. Wait on redis
  4. Initialize static files (Javascript, stylesheets, and images included in EDD image)
  5. Wait on postgres
  6. Wait on solr
  7. Run pending database migrations (if any)
  8. Re-index solr (if any changes made to database)
  9. Wait on rabbitmq
  10. Execute entrypoint command

The entrypoint workflow can be modified with the flags defined below. Set these flags in the
`command` entry of the service using the `jbei/edd-core` image in `docker-compose.override.yml`.
This output can be recreated with `docker-compose exec edd entrypoint.sh --help`.

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
        daphne
            Start a Django Channels webserver (daphne).
        channel [... [name]]
            Start a Django Channels worker listening on listed channel names (runworker).


## Starting EDD

Once configured, EDD is launched with either `docker-compose` for a single-node deployment, or
`docker stack deploy` for a Swarm deployment:

    # For single-node deployment, launch in detached mode
    docker-compose up -d

    # For Swarm deployment:
    # 1. Make sure the swarm manager is set up
    docker swarm init
    # 2. Aggregate configuration files
    docker-compose config > stack.yml
    # 3. Launch the stack (replace [NAME] with desired stack name)
    docker stack deploy -c stack.yml [NAME]

To shut down EDD:

    # For single-node deployment
    docker-compose down

    # For Swarm deployment (replace [NAME] with deployed stack name)
    docker stack down [NAME]

---------------------------------------------------------------------------------------------------

[1]:    https://docker.io/
[2]:    https://docs.docker.com/compose/overview/
[3]:    https://nginx.org/en/docs/
[4]:    https://letsencrypt.org/about/
[5]:    http://django-allauth.readthedocs.org/en/latest/index.html
[6]:    https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion
[7]:    http://ice.jbei.org/
[8]:    http://virtualenvwrapper.readthedocs.io/en/latest/index.html
