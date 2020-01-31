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

Docker Compose uses YAML files to define the networks, volumes, and services to
create and/or launch. EDD uses a split-file structure, with a base
`docker-compose.yml` file, checked in to source-control, defining the core
structure. There is also `docker-compose.override.yml`, not checked in to
source-control, and which contains customizations specific to each deployment.
By default, the `docker-compose` command will read both of these files, then
merge the results producing the final configuration.

## Configuration Files and Generator Scripts

A helper script exists in `./bin/init-config` that will generate configuration
files automatically. A typical development environment would run
`./bin/init-config offline --deploy=dev`. Using the defaults will create a
`secrets` directory and `docker-compose.override.yml`. The user and email set
in `git` will be configured as the EDD Administrator. A container running Nginx
will be configured to launch and proxy requests to the domain `edd.lvh.me`
(maps to `127.0.0.1`) to the EDD application.

Non-development deployments will run using at least some of the options to
`init-config`. For example, a deployment to https://edd.example.org/ might use:

    export EDD_USER="EDD Team"
    export EDD_EMAIL="edd-admins@example.org"
    ./bin/init-config offline --deploy='edd.example.org'

Running the above would set up the Nginx container to handle HTTP requests for
edd.example.org and auto-request a TLS certificate using the [Let's
Encrypt][18] service, and configure an administrator named 'EDD Team' with the
email 'edd-admins@example.org'.

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

-   **edd_attachments**: uploaded attachments in the EDD application.
-   **edd_staticfiles**: static assets used in the EDD application (e.g. images, scripts).
-   **postgres_db**: the Postgres databases.
-   **redis_db**: the Redis append-only file.
-   **solr_home**: Solr search indices.

If EDD is running with the Nginx proxy enabled, the following additional volumes are defined:

-   **nginx_certs**: cryptographic keys and certificates for securing with TLS.
-   **nginx_confd**: the configuration directory for Nginx.
-   **nginx_vhost**: the vhost directory for Nginx.
-   **nginx_webroot**: the root of the Nginx web directory tree.

If EDD is running with a bundled ICE service, the following additional volumes are defined:

-   **ice_index**: the Lucene / Hibernate Search data directory.
-   **ice_local**: the local working directory used by ICE WAR file.
-   **ice_pg**: the Postgres database used by ICE.

Docker Compose will create volumes using the default `local` storage driver, using the names
`PROJECTNAME_VOLUME`, e.g. `edd_postgres_db`. Alternate existing volumes may be used by setting
configuration in the `docker-compose.override.yml` file.

### Images

Images are the base of a container filesystem, and are what makes a container stateless. EDD uses
a mix of "official" images from the [Docker Hub][4], and custom images defined by Dockerfiles in
this repository. The bold links below point to the README documentation for each image. Custom
images also include links to the README for the base image.

-   **[edd-core][5]**: custom Dockerfile, based on official Python alpine image
    (via jbei/scikit-learn)
-   **[postgres][7]**: custom Dockerfile, based on official Postgres image, using version 9.6
-   **[redis][8]**: custom Dockerfile, based on official Redis image, using version 3.2
-   **[solr][9]**: custom Dockerfile, based on the [official Solr image][10] version 7.3
-   **[rabbitmq][11]**: custom Dockerfile, based on official RabbitMQ image, using version
    3.7-management-alpine
-   **[flower][12]**: custom Dockerfile, based on official Python alpine image (optional)
-   **[nginx][14]**: based on [official Nginx image][15], using mainline version
-   **nginx-gen**: based on [jwilder/docker-gen][16], using a custom template file
-   **[jrcs/letsencrypt-nginx-proxy-companion][17]**: third-party image, using latest release

### Services (Containers)

The individual services are defined by the combination of images with configuration for networks,
storage, service dependencies, environment, custom commands, and anything else controlling how
the service is run. With the exception of the first two services -- `edd`, and `worker` -- there
is a one-to-one relationship from images to services. The two exceptions both make use of the
`edd-core` image, and execute different commands to use the same code for different roles.

-   **http**: runs the EDD webapp
-   **worker**: long-running and background tasks are run here with Celery
-   **websocket**: handles processing WebSocket messages
-   **postgres**: provides EDD's database
-   **redis**: provides the cache back-end for EDD
-   **solr**: provides a search index for EDD
-   **rabbitmq**: messaging bus that supports Celery
-   **flower**: management / monitoring application for Celery (optional)
-   **smtp**: mail server that supports emails from EDD
-   **nginx**: webserver that proxies clients' HTTP requests to other Docker services
-   **nginx-gen**: listens for container events, generates nginx config to proxy requests
-   **letsencrypt**: monitors TLS certificates and creates/renews with [Let's Encrypt][18]

---

[1]: ../README.md
[2]: https://docker.io
[3]: https://docs.docker.com/compose/overview/
[4]: https://hub.docker.com/explore/
[5]: edd/README.md
[6]: https://hub.docker.com/_/buildpack-deps/
[7]: https://hub.docker.com/_/postgres/
[8]: https://hub.docker.com/_/redis/
[9]: solr/README.md
[10]: https://hub.docker.com/_/solr/
[11]: https://hub.docker.com/_/rabbitmq/
[12]: flower/README.md
[13]: smtp/README.md
[14]: nginx/README.md
[15]: https://hub.docker.com/_/nginx/
[16]: https://github.com/jwilder/docker-gen
[17]: https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion
[18]: https://letsencrypt.org
