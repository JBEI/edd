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
`init-config.sh` in this directory. The script optionally takes two arguments, a user name and
an email. If these are not provided, the script reads these values from the current user's `git`
configuration, and fails if the `user.name` or `user.email` configuration of `git` is not set.
If the configuration files `docker-compose.override.yml` and `secrets.env` are not present, the
script will create them using the example template files, `docker-compose.override.yml-example`
and `secrets.env-example`. The script replaces contact information in the former with the script
arguments (or git configured values), and generates random passwords in the latter.

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

### Volumes (Storage)

Containers are designed to be stateless. Any filesystem changes to a container will not survive a
removal and re-launch of that container. Stateful changes are handled via mounting Docker Volumes
in the container. EDD defines the following Volumes:

* __pgdata__: the Postgres databases.
* __solrdata__: Solr search indices.
* __attachdata__: uploaded attachments in the EDD application.
* __staticdata__: static assets used in the EDD application (e.g. images, scripts).
* __redisdata__: the Redis append-only file.
* __tlsdata__: cryptographic keys and certificates for securing with TLS.

Docker Compose will create volumes using the default `local` storage driver, using the names
`PROJECTNAME_VOLUME`, e.g. `edd_pgdata`. Alternate existing volumes may be used by setting
configuration in the `docker-compose.override.yml` file.

### Images

Images are the base of a container filesystem, and are what makes a container stateless. EDD uses
a mix of "official" images from the [Docker Hub][4], and custom images defined by Dockerfiles in
this repository. The bold links below point to the README documentation for each image. Custom
images also include links to the README for the base image.

* __[edd-core][5]__: custom Dockerfile, based on [buildpack-deps:stretch][6]
* __[postgres][7]__: official Postgres image, using version 9.4
* __[redis][8]__: official Redis image, using version 3.2
* __[solr][9]__: custom Dockerfile, based on the [official Solr image][10] version 5.5
* __[rabbitmq][11]__: official RabbitMQ image, using version 3.6-management
* __[flower][12]__: custom Dockerfile, based on [buildpack-deps:stretch][6]
* __[exim4][13]__: custom Dockerfile, [buildpack-deps:stretch][6]
* __[nginx][14]__: [official Nginx image][15], using version 1.11
* __[jwilder/docker-gen][16]__: third-party image, using latest release
* __[jrcs/letsencrypt-nginx-proxy-companion][17]__: third-party image, using latest release

### Services (Containers)

The individual services are defined by the combination of images with configuration for networks,
storage, service dependencies, environment, custom commands, and anything else controlling how
the service is run. With the exception of the first two services -- `edd`, and `worker` -- there
is a one-to-one relationship from images to services. The two exceptions both make use of the
`edd-core` image, and execute different commands to use the same code for different roles.

* __edd__: runs initial startup tasks and prepares the other services, and runs the EDD webapp
* __worker__: long-running and background tasks are run here with Celery
* __postgres__: provides EDD's database
* __redis__: provides the cache back-end for EDD
* __solr__: provides a search index for EDD
* __rabbitmq__: messaging bus that supports Celery
* __flower__: management / monitoring application for Celery
* __smtp__: mail server that supports emails from EDD
* __nginx__: webserver that proxies clients' HTTP requests to other Docker services
* __nginx-gen__: listens for container events, generates nginx config to proxy requests
* __letsencrypt__: monitors TLS certificates and creates/renews with [Let's Encrypt][18]

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
