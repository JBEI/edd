# Deploying EDD

## Pre-requisites

Have [Docker][1] and [Docker Compose][2] installed on the target host. EDD is
tested with Docker version 18.09.2 and Docker Compose version 1.23.2; these
instructions are not guaranteed to work for any older versions of Docker or
Docker Compose. Also have at least the `bin` and `docker` directories, along
with `docker-compose.yml` and `docker-compose.override.yml-example` copied to
the target host.

## Initial configuration

There are many configuration options that can be set before launching EDD. The
`init-config` script handles creating additional options based on included
example files:

-   **`secrets`**: Directory contains secret values loaded into containers at
    launch; these values will generally be passwords, keys, and other
    secret information.
-   **`docker-compose.override.yml`**: Overrides the default configuration used
    to launch the Docker containers. Non-secret environment, and other launch
    options will be put into this file.

More information and example configuration options can be found in the example
files, and copied into the files created automatically by the
`init-config` script.

## Starting EDD

Before starting a deployment, the Docker images used by the various EDD
services must be present on the host computer. This is accomplished either by
pulling already-built images from a Docker Registry, or building the images
from the Dockerfiles included in the project. To pull the images, use
`docker-compose pull`. Customizing builds is beyond the scope of this document,
consult the individual README files included with each Dockerfile if a custom
build is required.

## TLS and domain configuration

EDD includes a set of Docker containers to auto-configure an [Nginx][3]
webserver with TLS encryption via certificates generated with the [Let's
Encrypt][4] service. By setting some environment in the `http` service
container, EDD will generate a configuration file for Nginx to proxy HTTP
requests and secure connections with TLS.

To proxy requests to a container, set the environment variables `VIRTUAL_HOST`
and `VIRTUAL_PORT` on that container. The values of these variables are the DNS
hostname, and the port exposed on the container, respectively. These values are
set automatically for the central EDD service by the `init-config` script, but
only for a single domain, via the `--domain` option. For more advanced
configuration, consult the documentation for the
[`letsencrypt-nginx-proxy-compainion`][6].

If alternate TLS configuration -- or any other Nginx configuration -- is
desired, replace the default `nginx` service image with one containing options
for your alternate configuration, or re-write the `nginx.tmpl` template.

## Linking to an ICE server

The purpose of EDD is to store actionable datasets in synthetic biology
engineering. An important piece of information in understanding this data is
the genetic sequences of engineered organisms. The EDD uses another piece of
JBEI software, the [Inventory of Composable Elements][7], or ICE, to keep track
of this information. Any functionality on EDD that deals with linking to
strains will not work unless the EDD server is connected to an ICE server.

To link to an ICE server, EDD uses a Base64-encoded key. Create a key using a
command like this:

```bash
openssl rand -base64 64 | tr -d '\n' > hmac.key
```

This will create a file named `hmac.key`. Copy this file to the `secrets`
directory, and add a secret to the `docker-compose.override.yml` configuration
for the services using `edd-core` and `ice`. The `edd-core` image will check
for a secret named `edd_ice_key`, and the `ice` image will load in HMAC keys
using the value of the `ICE_HMAC_SECRETS` environment.

## Creating an EDD administrator account

Several parts of EDD's configuration is contained within the running
application's database, instead of loaded from files at startup. A login
account to the EDD application, with access to the administration interface, is
the easiest way to edit this configuration. To create an administrator account,
run this command inside the `http` service, after EDD has finished startup:

```bash
python manage.py createsuperuser
```

The command will prompt for a username, email address, and password. Logging in
with the username and password combination will send a confirmation email to
the provided address. Once the email is validated, the account is active and an
"Administration" link to the EDD will appear on every page, which will load the
administration interface when clicked.

## Customizing EDD

Inside the administration interface, a few items should be modified prior to
serious use of the application.

1. Set the site name and domain in **Sites**. The default confirmation email
   will use `example.com` as the name of the EDD site, because that is the
   default value set in the Sites admin. Click through to **Sites**, and then
   through to **example.com** to edit the name and domain to match
   your deployment.
2. Set **Brandings** to use. This admin section sets the logo, favicon, and
   custom stylesheets used in EDD. Click through to **Add Branding** to upload
   these custom files and associate them with the default site set in the
   previous step.
3. Create **Flat pages**. These are simple text pages to display in EDD. Here
   is where you can add pages containing information like Privacy Policies,
   Terms of Service, etc.
4. Add **Social applications**. This section is where you can configure logins
   using OAuth from other services, such as Google, LinkedIn, etc. This will
   also require changes to `local.py` to add the Django apps for each login
   provider. See the [django-allauth documentation][5] for more details.

## Custom Python configuration

The following configuration options are specific to EDD and may be overridden in a `local.py`.

-   `EDD_ALLOW_SIGNUP` -- boolean flag; if True, self-registration of accounts
    is enabled.
-   `EDD_DEPLOYMENT_ENVIRONMENT` -- string value, changes background color and
    adds a visual environment label to assist in telling apart testing vs
    production instances. A None value will result in no visual changes added
    to the interface.
-   `EDD_ENABLE_GRAPHQL` -- boolean flag; if True, publish a GraphQL endpoint
    for EDD.
-   `EDD_EXTERNAL_SCRIPTS` -- iterable of URL strings; these will be scripts
    added to the default EDD page template. Put links for any external scripts
    here, to avoid creating custom HTML templates.
-   `EDD_IMPORT_BULK_CREATE_BATCH_SIZE` -- integer value, default `None`; the
    maximum number of bulk object creations to perform in a batch for the
    prototype import tool. None results in all objects up to
    EDD_IMPORT_PAGE_SIZE being created in a single batch (i.e. in one query).
-   `EDD_IMPORT_BULK_PK_LOOKUP_BATCH` -- integer value, default 100; the
    maximum number of line or assay primary keys to include in a single bulk
    lookup query during the final execution of the prototype import. Affects
    import performance.
-   `EDD_IMPORT_ERR_REPORTING_LIMIT` -- integer value, default 25; the maximum
    number of occurrences of any single type of error reported to clients of
    the prototype import via websocket notifications. Error occurrences beyond
    this limit are not reported to clients.
-   `EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT` -- integer value, default 25; the
    maximum number of measurement type identifier lookup errors to tolerate
    before aborting an import using the prototype import tool, or zero to look
    up all the types referenced in the file. Most measurement type identifiers
    are resolved by contacting third-party databases such as PubChem, so large
    numbers of lookups can be expensive. Keeping this number low makes the
    import more responsive, but raising it increases the amount of potentially
    useful user feedback generated by each import attempt.
-   `EDD_IMPORT_PAGE_SIZE` -- integer value, default 1,000; the maximum number
    of resolved import records stored in a single cache page prior to finally
    executing the import. Affects import performance for both legacy and the
    prototype import.
-   `EDD_IMPORT_PAGE_LIMIT` -- integer value; the maximum number of cache pages
    in a single import. Combined with `EDD_IMPORT_PAGE_SIZE`, this creates a
    limit on the number of values that can be imported and helps prevent
    erroneous or malicious imports from overwhelming the system. Affects import
    performance for both legacy and the prototype import.
-   `EDD_IMPORT_CACHE_LENGTH` -- integer value, default 24 hours; the
    expiration time in seconds after which an import is expired from the cache,
    regardless of whether it has been executed. Affects import performance for
    both legacy and the prototype import.
-   `EDD_IMPORT_UPLOAD_LIMIT` -- integer value, default 1048576 = 1 MB; the
    maximum size in bytes of files accepted by the user interface for the
    prototype import tool. This value is also displayed to users in help text
    and error messages. The limit configured here is enforced by the import
    user interface, and is displayed to users in help text and in error
    messages if they attempt a larger upload. This setting does not affect the
    upload limit for the import REST API endpoint. In a typical installation,
    the REST API upload limit is configured and enforced separately by an nginx
    reverse proxy. The 1MB default value for EDD_IMPORT_UPLOAD_LIMIT is
    consistent with the nginx default value of `client_max_body_size`.
-   `EDD_LATEST_CACHE` -- string value; the name of the Django cache to use for
    storing a user's latest viewed studies.
-   `EDD_ONLY_SUPERUSER_CREATE` -- boolean flag, or the string "permission"
    (default False); if True, only superuser accounts may create new studies.
    If set to "permission", only users with the "Main | Study | Can Add Study"
    permission configured via the admin site may create new studies.
-   `ICE_FOLDER_SEARCH_PAGE_SIZE` integer value; tunes the performance of part lookups in ICE
    folders by controlling the page size for parts from a folder
-   `ICE_KEY_ID` -- string value, the identifier of the shared key used to
    communicate with ICE.
-   `ICE_SECRET_HMAC_KEY` -- string value, base64-encoded key used to sign
    requests to ICE.
-   `ICE_URL` -- URL of the ICE instance associated with EDD.
-   `ICE_REQUEST_TIMEOUT` -- 2-tuple of integers, for the seconds to set
    connection and read timeouts in communication with ICE.
-   `ICE_VERIFY_CERT` -- boolean flag; if True, use strict certificate
    verification when connecting to ICE. _Note_: older versions of EDD used the
    name `VERIFY_ICE_CERT` instead. EDD will check for this name and emit a
    warning; the old name will be removed at a future date.
-   `REQUIRE_UNIPROT_ACCESSION_IDS` -- boolean flag; if True, protein
    measurement IDs must conform to the pattern of UniProt identifiers.
    Otherwise, arbitrary text may label a protein.

### Configuring EDD's prototype import tool

EDD includes a prototype import tool being field tested as an eventual
replacement for the existing import tool. By default the prototype is turned
off in production, but it may be useful to enable it in some circumstances. The
prototype will be phased into production use, so it's possible that at points
both tools may be useful until the transition is complete.

#### Enabling the prototype import tool

To enable the prototype, you have to configure it since it's disabled by
default. To include the new import app, add the following code to the
`settings` module:

```python
EDD_USE_PROTOTYPE_IMPORT = True
```

#### Tuning prototype performance

To configure performance for the prototype import, see settings that start with
`EDD_IMPORT`. Those that affect the prototype are marked as such, and be aware
that a few impact both the legacy and the prototype.

## Starting EDD

Once configured, EDD is launched with either `docker-compose` for a single-node deployment, or
`docker stack deploy` for a Swarm deployment:

```bash
# For single-node deployment, launch in detached mode
docker-compose up -d
```

```bash
# For Swarm deployment:
# 1. Make sure the swarm manager is set up
docker swarm init
# 2. Aggregate configuration files
docker-compose config > stack.yml
# 3. Launch the stack (replace [NAME] with desired stack name)
docker stack deploy -c stack.yml [NAME]
```

To shut down EDD:

```bash
# For single-node deployment
docker-compose down
```

```bash
# For Swarm deployment (replace [NAME] with deployed stack name)
docker stack down [NAME]
```

---

[1]: https://docker.io/
[2]: https://docs.docker.com/compose/overview/
[3]: https://nginx.org/en/docs/
[4]: https://letsencrypt.org/about/
[5]: http://django-allauth.readthedocs.org/en/latest/index.html
[6]: https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion
[7]: http://ice.jbei.org/
