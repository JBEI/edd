# Experiment Data Depot

The Experiment Data Depot (EDD) is a web-based repository of processed biological data obtained
via experimentation.  See the deployed version at [public-edd.jbei.org][1].

## Contents

* [Getting Started](#Getting_Started)
* [Running EDD](#Running_EDD)

For a more detailed reference for EDD's low-level configuration options, see [Configuration][4].
If you're just starting out with EDD, follow directions here first.

---------------------------------------------------------------------------------------------------

## Getting Started <a name="#Getting_Started"/>

With [Docker][2] and [Docker Compose][3] installed, launching the entire EDD software stack is as
simple as cloning the git repository and running:

    ./init-config.sh
    docker-compose up -d

Without additional configuration, the launched copy of EDD will be using default options, so some
functions (e.g. TLS support, external authentication, referencing an ICE deployment) won't work.
See below for more detailed instructions for installing Docker and configuring EDD for your
deployment environment.

---------------------------------------------------------------------------------------------------

## Running EDD <a name="#Running_EDD"/>

This section is a quick reference for commonly helpful commands for running / developing EDD. Many
of them use Docker Compose and other related Docker tools that aren't fully documented here.

* __Docker services__

  `docker-compose` is the recommended tool for controlling EDD services. `docker-compose.yml`
  defines the list of services as top-level entries under the 'services' line.

  For quick reference, at the time of writing the provided services are:
    * edd: runs initial setup tasks and prepares the other services
    * appserver: runs the EDD web application
    * worker: long-running and background tasks are run here with Celery
    * postgres: provides EDD's database
    * redis: provides the cache back-end for EDD
    * solr: provides a search index for EDD
    * rabbitmq: messaging bus that supports Celery
    * flower: management / monitoring application for Celery
    * smtp: mail server that supports emails from EDD
    * nginx: webserver that proxies clients' HTTP requests to other Docker services

  While edd is running, you can also get a list of its services by runnning `docker-compose ps`
  from the main directory. Each service will be listed in the "Name" column of the output, with a
  prefix/postfix automatically added by Docker-compose: e.g. "edd_appserver_1" is the first
  instance of the `appserver` service, launched from a directory called "edd". You can
  alternatively use `docker ps` from any directory to get a similar listing, though it will include
  all containers running on your host, not just those defined by EDD.

* __`docker-compose` commands__
   * Build all services:  `docker-compose build`
   * Startup all services in detached mode: `docker-compose up -d` (recommended to keep muliple
     service logs from cluttering the screen, and so `^C` doesn't stop EDD)
   * View logs: `docker-compose logs [service]`
   * Bringing down all services: `docker-compose down`
   * See more in the [Docker Compose documentation][3]
   * Compose may complain about a missing variables. If this bothers you, run an export
     command to assign an empty string to each: `export EDD_HOST_DIR=`

* __Determining the local URL for EDD's web interfaces:__

  If using a Linux host or Docker for Mac, use the hostname `localhost`. If using Docker Toolbox or
  docker-machine, use the hostname given by `docker-machine ip default`.
    * __EDD:__ https://localhost/
    * __EDD's REST API:__ https://localhost/rest/ (if enabled)
    * __Solr:__ https://localhost/solr/
    * __Flower:__ https://localhost/flower/
    * __RabbitMQ Management Plugin:__ https://localhost/rabbitmq/

* __Interfacing with EDD's services from the command line:__
   * To run commands in __new__ containers, use `docker-compose run $SERVICE $COMMAND`,
     e.g.: `docker-compose run edd python manage.py shell`. Many Docker tutorals use "run" to
   simplify the directions, but it should generally be avoided since it creates new containers
   unnecessarily.
   * Run commands in __existing__ containers with `docker-compose exec $SERVICE $COMMAND`,
     e.g.: `docker-compose exec appserver python manage.py shell`
   * Restart misbehaving services with:  `docker-compose restart $SERVICE`
   * Other useful sample commands:
       * Connect to the Postgres command line: `docker-compose exec postgres psql -U postgres`
       * Connect to the Django shell: `docker-compose exec appserver python manage.py shell`

* __Running Docker commands in new shell sessions__
    * The `docker` command will look for a Docker daemon running on the local machine by
      default. Mac hosts currently must use a daemon running in a VirtualBox guest VM. Load
      the Docker environment on the guest with:

          eval "$(docker-machine env default)"

    * Docker will re-use built images, so changes to code may not be reflected in running
      containers. (Re)build the container images with current code using:

          docker-compose build

---------------------------------------------------------------------------------------------------

[1]:    https://public-edd.jbei.org
[2]:    https://docker.io
[3]:    https://docs.docker.com/compose/overview/
[4]:    docs/Configuration.md