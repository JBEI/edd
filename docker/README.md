# Docker Service Infrastructure

This directory contains configuration and scripts relating to services used by the
[Experiment Data Depot][1] (EDD). The EDD uses [Docker][2] containers as microservices to
simplify deployments. While it is possible to install each of the services individually, there
are better uses of time. Prior to our adoption of Docker, an experienced sysadmin could install
and configure all service dependencies in about a day. Since then, more service dependencies were
added. In contrast, installing all services on a host with a Docker daemon only takes the minute
or two to download the container images, or slightly longer to build the container images from
the definitions here.

The [Docker Compose][3] tool handles defining configuration to use for the networks, storage,
containers, and the relations between them all. More information on Docker and Docker Compose can
be found at the documentation for those projects. The remainder of this document describes how
EDD is structured using these tools.

## Compose File Structure

Docker Compose uses YAML files to define the networks, volumes, and services to create and/or
launch. EDD uses a split-file structure, with a base `docker-compose.yml` file, checked in to
source-control, defining the core structure. There is also `docker-compose.override.yml`, not
checked in to source-control, and which contains customizations specific to each deployment.
By default, the `docker-compose` command will read both of these files, then merge the results
producing the final configuration. More information on customizing configuration is contained
in comments in the example file, `docker-compose.override.yml-example`. To validate the files and
view the merged results, run `docker-compose config`.

## Configuration Files and Generator Scripts

Configuration files are initialized and generated for a new deployment using the script
`init-config` in the `bin` directory. Listed here is the help output for the `init-config` script:

    Usage: . init-config [options]
    Options:
        -h, --help
            Print this help message.

        -d domain, --domain domain
            Sets the domain to use in automated Let's Encrypt service.
        -m mail, --mail mail
            Sets the default administrator email for EDD; uses git user.email if omitted.
        -u user, --user user
            Sets the default administrator name for EDD; uses git user.name if omitted.
        --noinput
            Runs the initialization without any input prompts for omitted information.
        --nonginx
            Builds a Docker Compose configuration without the nginx webserver container(s).

        --split-nginx
            Generates configuration to use a split Compose file for running Nginx. This will
            create a Docker virtual network to connect containers in both Compose files, and
            Docker virtual volumes to share data between containers. Implies --nonginx; see
            also: --split-media, --split-network, --split-static
        --split-media name
            Specifies the Docker volume name used for the EDD media directory. If omitted,
            a generated volume name will be used. Must be used with --split-nginx
        --split-network name
            Specifies the Docker network name used to link the EDD containers with an nginx
            proxy. If omitted, a generated network name will be used. Must be used
            with --split-nginx
        --split-static name
            Specifies the Docker volume name used for the EDD static directory. If omitted,
            a generated volume name will be used. Must be used with --split-nginx

        --seed secret
            This script generates some random secret values based on the current time and
            known text. Set this flag to add some extra entropy to generated values.

A typical development environment would run this script as `. init-config` or `source init-config`.
Using the defaults will create a `secrets` directory and `docker-compose.override.yml` from the
example file. The user and email set in `git` will be configured as the EDD Administrator. A
container running Nginx will be configured to launch and proxy requests to the domain `edd.lvh.me`
(maps to `127.0.0.1`) to the EDD application.

Non-development deployments will run using at least some of the options to `init-config`. For
example, a deployment to https://edd.example.org/ might use:

    . init-config --domain 'edd.example.org' \
        --mail 'edd-admins@example.org' \
        --user 'EDD Team' \
        --noinput

Running the above would set up the Nginx container to handle HTTP requests for edd.example.org and
auto-request a TLS certificate using the [Let's Encrypt][18] service, and configure an
administrator named 'EDD Team' with the email 'edd-admins@example.org'.

## Docker Abstractions

### Networks (Communication)

EDD uses two virtual Docker networks: a proxy network (`PROJECTNAME_proxynet`), and a backend
network (`PROJECTNAME_backnet`). These separate networks make it possible to limit connections
between containers to those that are necessary for the containers to do the work. The two networks
roughly are responsible for connecting the containers that interact with the host network, and the
containers that interact with other containers.

Each container is assigned an IP address in the 172.16.0.0/12 block, addressable by all other
containers attached to the same network. Some containers are configured to expose ports by
instructing Docker to listen to ports on a host interface, and forwarding packets to ports on
the private Docker virtual network. For example, the generated `docker-compose.override.yml`
will forward ports 80 and 443 on the Docker host loopback network interface to the same ports on
the virtual network interface of the `nginx` service.

The proxy network connects the services which will reach the external host network via the nginx
proxy. The containers on the proxy network are `nginx` itself, the companion containers used to
generate the nginx configuration and certificates, and the core EDD service. Since no other
services get proxied at this time, nothing else needs to connect to the network.

Most of the other containers are connected to the backend network. This network connects the core
EDD service to the other services used in the application. Having a network defined only for the
internal services helps to keep boundaries between these services and the outside world. All
changes to these services from the outside, come only via the EDD core service, unless additional
port mappings are defined in the override Compose file.

If EDD is running with a bundled ICE service, an additional network (`PROJECTNAME_icenet`) is
created, so the ICE services can run isolated from the other EDD services. This network connects
the services required by ICE, and also has connections for the services running the `edd-core`
Docker image, so they may communicate with ICE. The core ICE service will also connect to the
proxy network, enabling a reverse proxy to access the ICE web application.

### Volumes (Storage)

Containers are designed to be stateless. Any filesystem changes to a container will not survive a
removal and re-launch of that container. Stateful changes are handled via mounting Docker Volumes
in the container. EDD defines the following Volumes:

* __postgres_db__: the Postgres databases.
* __solr_cores__: Solr search indices.
* __edd_attachments__: uploaded attachments in the EDD application.
* __edd_staticfiles__: static assets used in the EDD application (e.g. images, scripts).
* __redis_db__: the Redis append-only file.

If EDD is running with the Nginx proxy enabled, the following additional volumes are defined:

* __nginx_certs__: cryptographic keys and certificates for securing with TLS.
* __nginx_confd__: the configuration directory for Nginx.
* __nginx_vhost__: the vhost directory for Nginx.
* __nginx_webroot__: the root of the Nginx web directory tree.

If EDD is running with a bundled ICE service, the following additional volumes are defined:

* __ice_index__: the Lucene / Hibernate Search data directory.
* __ice_local__: the local working directory used by ICE WAR file.
* __ice_pg__: the Postgres database used by ICE.

Docker Compose will create volumes using the default `local` storage driver, using the names
`PROJECTNAME_VOLUME`, e.g. `edd_postgres_db`. Alternate existing volumes may be used by setting
configuration in the `docker-compose.override.yml` file.

### Images

Images are the base of a container filesystem, and are what makes a container stateless. EDD uses
a mix of "official" images from the [Docker Hub][4], and custom images defined by Dockerfiles in
this repository. The bold links below point to the README documentation for each image. Custom
images also include links to the README for the base image.

* __[edd-core][5]__: custom Dockerfile, based on official Python alpine image
  (via jbei/scikit-learn)
* __[postgres][7]__: custom Dockerfile, based on official Postgres image, using version 9.6
* __[redis][8]__: custom Dockerfile, based on official Redis image, using version 3.2
* __[solr][9]__: custom Dockerfile, based on the [official Solr image][10] version 7.3
* __[rabbitmq][11]__: custom Dockerfile, based on official RabbitMQ image, using version
  3.7-management-alpine
* __[flower][12]__: custom Dockerfile, based on official Python alpine image (optional)
* __[nginx][14]__: based on [official Nginx image][15], using mainline version
* __nginx-gen__: based on [jwilder/docker-gen][16], using a custom template file
* __[jrcs/letsencrypt-nginx-proxy-companion][17]__: third-party image, using latest release

### Services (Containers)

The individual services are defined by the combination of images with configuration for networks,
storage, service dependencies, environment, custom commands, and anything else controlling how
the service is run. With the exception of the first two services -- `edd`, and `worker` -- there
is a one-to-one relationship from images to services. The two exceptions both make use of the
`edd-core` image, and execute different commands to use the same code for different roles.

* __edd__: runs initial startup tasks and prepares the other services, and runs the EDD webapp
* __worker__: long-running and background tasks are run here with Celery
* __websocket__: handles processing HTTP and WebSocket messages
* __postgres__: provides EDD's database
* __redis__: provides the cache back-end for EDD
* __solr__: provides a search index for EDD
* __rabbitmq__: messaging bus that supports Celery
* __flower__: management / monitoring application for Celery (optional)
* __smtp__: mail server that supports emails from EDD
* __nginx__: webserver that proxies clients' HTTP requests to other Docker services
* __nginx-gen__: listens for container events, generates nginx config to proxy requests
* __letsencrypt__: monitors TLS certificates and creates/renews with [Let's Encrypt][18]

## Extending to run local ICE

EDD relies on integration with the Inventory of Composable Elements (ICE) to act as a repository
for strains referenced in EDD studies. If there is not an existing ICE deployment available, some
features of EDD will not work. To help with testing and evaluation, there is an option to use the
same Docker infrastructure as EDD to launch an instance of ICE. The following steps cover the
basic configuration changes required.

Add the YAML in `ice.yml` to the appropriate places in `docker-compose.override.yml`; either do
this manually, or generate a new Compose file using commands like the following:

    docker-compose -f docker-compose.yml -f docker-compose.override.yml -f ice.yml \
        config > combined.yml
    # run future commands using `-f combined.yml` as below
    docker-compose -f combined.yml up
    # or run as a Swarm stack
    docker stack deploy -c combined.yml [NAME]

---------------------------------------------------------------------------------------------------

[1]:    ../README.md
[2]:    https://docker.io
[3]:    https://docs.docker.com/compose/overview/
[4]:    https://hub.docker.com/explore/
[5]:    edd/README.md
[6]:    https://hub.docker.com/_/buildpack-deps/
[7]:    https://hub.docker.com/_/postgres/
[8]:    https://hub.docker.com/_/redis/
[9]:    solr/README.md
[10]:   https://hub.docker.com/_/solr/
[11]:   https://hub.docker.com/_/rabbitmq/
[12]:   flower/README.md
[13]:   smtp/README.md
[14]:   nginx/README.md
[15]:   https://hub.docker.com/_/nginx/
[16]:   https://github.com/jwilder/docker-gen
[17]:   https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion
[18]:   https://letsencrypt.org
