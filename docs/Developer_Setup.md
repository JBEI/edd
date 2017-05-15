# Developer Setup

This document describes how to get a development environment configured for modifying or
contributing to EDD.

## Contents
* [Mac OS Setup](#MacOS_Setup)
    * [XCode](#XCode)
    * [HomeBrew](#HomeBrew)
    * [Docker](#Docker)
* [Linux / Debian](#Debian)
* Common Setup Tasks

---------------------------------------------------------------------------------------------------

### Mac OS Setup <a name="MacOS_Setup"/>

This section contains directions for setting up a development environment for EDD on Mac OS.

* XCode <a name="XCode"/>
    * Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
* Homebrew <a name="HomeBrew"/>
    * [Homebrew][1] is a package manager for OS X. The Homebrew packages handle installation and
      dependency management for Terminal software. The Caskroom extension to Homebrew does the
      same for GUI applications.
    * To install:
      `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
      and follow prompts.
    * `brew doctor` should say `Your system is ready to brew.` or describe any problems.
    * From the edd root directory, `brew bundle` should install additional software dependencies.
    * It is a good idea to occaisionally run `brew update` to refresh Homebrew's list of available
      packages and versions; and run `brew upgrade` to install updated versions of your installed
      Homebrew packages.
* Docker <a name="Docker"/>
    * [Docker][2] is a container virtualization platform: all software, configuration, and
      dependencies required to run a service are packaged into standalone images. These images are
      ready to run immediately upon being copied to a new host running a Docker daemon.
    * Docker will be installed already via Homebrew in the previous step.
    * Running Docker images
        * Verify Docker is configured by running: `docker run --rm hello-world`
            * Get `docker: command not found`? You didn't successfully install from Homebrew.
    * Try the command `docker-compose`
        * If you get `Illegal instruction: 4`, you have an older Mac that cannot run with the
          compiled binary provided by the Homebrew packages; run `pip install docker-compose` to
          fix the error.
        * Normal output is helptext showing the commands to use with `docker-compose`.
    * Resources available for Docker containers are set in the Docker menu Preferences, under the
      Advanced tab. It is recommended to allocate at least 2 CPU cores and 2 GB RAM to Docker.
      Click the `Apply & Restart` button to restart Docker with updated resource allocations.
* Complete "Common Setup Tasks" below to get EDD configured and running for the first time
* Complete the "For Developers" section below for a few additional development configurations


### Linux / Debian Setup<a name="Debian"/>

This section contains directions for setting up a production deployment for EDD on Debian.

* Follow the Docker-recommended instructions for [installing the daemon for your distro][5].
    * There is a `docker` package in the Debian apt repos. It isn't [Docker][2]!
    * There is a `docker.io` package too; this can work, but it will generally be outdated.
* Test by running `docker run --rm hello-world` and `docker-compose`
* Complete "Common Setup Tasks" below now that Docker is in place


### Common Setup Tasks
After you have all of the Docker tools minimally configured for your environment, perform the
following steps to configure EDD and launch it for the first time.

* __Clone the repo__: `git clone https://github.com/JBEI/edd.git`

* __Install virtualenvwrapper__
    * `pip install virtualenvwrapper`
    * Create a folder for your virtualenvs; recommend `~/.virtualenvs` or `/usr/local/virtualenvs`
    * Add lines to your `.bashrc`:

          export WORKON_HOME=~/.virtualenvs
          source /usr/local/bin/virtualenvwrapper.sh

    * Activate changes with `source ~/.bashrc`

* __From `./docker_services/` run `. init-config --project edd`__
  This script will:
    * Test your git configuration
    * Copy sample configuration files
    * Generate random passwords for use in autoconfiguring EDD's Docker services
    * Create a virtualenv named `edd`

* __Configure `secrets.env`__
  The `init-config` script will create a `secrets.env` file, containing random generated passwords
  and connection URLs for services. These passwords are set in the service data volumes on first
  launch; to use alternate passwords or existing services (e.g. if you already have a Postgres
  cluster), edit the file prior to launching EDD.

* (_optional_) __Build or Pull EDD's images__
  The start script will automatically ensure that Docker images are present on the host before
  launching; however, it is sometimes useful to run this step manually to have more control over
  the images used to launch containers.
    * Build images from the repository Dockerfiles with `docker-compose build`
    * Pull pre-built images from Docker Hub with `docker-compose pull`
    * Tag images with version tags using the `docker tag {src-image} {tag-name}` command

* __Launch EDD's services__
  Run `./start-edd.sh`. At this point, you can use Docker commands to view the logs for
  each service or to locate the IP for viewing EDD's web interface.

  See "Running EDD" below for a list of helpful commands. If you skipped the previous step, this
  command will take significantly longer the first time you run it, since Docker has to initially
  build / configure the EDD services before they can run.

* __Install and configure a supporting [ICE][7] deployment__
  EDD requires ICE as a reference for strains used in EDD's experiments. You will not be able to
  reference strains in your EDD studies until EDD can successfully communicate and authenticate
  with ICE.
    * Follow ICE's directions for installation/setup
    * Create a base-64 encoded HMAC key to for signing communication from EDD to ICE. EDD's default
      configuration assumes a key ID of 'edd', but you can change it by overriding the value of
      `ICE_KEY_ID` in your `local.py`. For example, to generate a random 64-byte/512-bit key:

          openssl rand -base64 64 | tr -d '\n' > hmac.key

    * Configure ICE with the HMAC key. In the `rest-auth` folder of the linked ICE deployment, copy
      the `hmac.key` file above to a file named with `ICE_KEY_ID`; 'edd' by default.
    * Configure EDD with the HMAC key. Edit `secrets.env` to set the value of `ICE_HMAC_KEY` to the
      value inside `hmac.key`. Do a `docker-compose restart` if you already had Docker running.
    * See directions under Common 'Maintenance/Development Tasks' to test EDD/ICE communication


### For Developers:

* There is configuration already in place to help you work on EDD. Uncomment support for the Django
  debug toolbar in the sample `local.py` file
* The EDD makes use of Node.js packages for managing front-end code. All dev dependencies are
  contained in the Dockerfile in the `node` directory, available under the tag `jbei/edd-node` on
  Docker Hub. This image has the programs `node`, `npm`, `grunt`, and `bower` installed, and is
  used to prepare front-end assets. EDD uses [TypeScript][4] for its client-side interface, and
  installs JavaScript libraries with [Bower][9].
    * Running `start-edd.sh` will automatically compile TypeScript and install libraries
    * Launch a container with the `jbei/edd-node` image, and mounting volumes from the `init`
      container, to manually run node commands; e.g.:

          docker run --rm -it --volumes-from "$(docker-compose ps -q init | head -1)" \
            jbei/edd-node:latest /bin/bash

      then, you may run commands such as `grunt test`.

#### Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in `./edd/settings/local.py` INSTALLED_APPS

---------------------------------------------------------------------------------------------------

## Running EDD <a name="#Running_EDD"/>

This section is a quick reference for commonly helpful commands for running / developing EDD. Many
of them use Docker Compose and other related Docker tools that aren't fully documented here.

* __Docker services__

  `docker-compose` is the recommended tool for controlling EDD services. `docker-compose.yml`
  defines the list of services as top-level entries under the 'services' line.

  For quick reference, the provided services are:
    * __init__: runs initial startup tasks and prepares the other services
    * __edd__: WSGI server that runs the EDD webapp
    * __worker__: long-running and background tasks are run here with Celery
    * __postgres__: provides EDD's database
    * __redis__: provides the cache back-end for EDD
    * __solr__: provides a search index for EDD
    * __rabbitmq__: messaging bus that supports Celery
    * __flower__: management / monitoring application for Celery
    * __smtp__: mail server that supports emails from EDD

  These additional services may be included as well:
    * __nginx__: webserver that proxies clients' HTTP requests to other Docker services
    * __nginx-gen__: monitors container start/stop events to generate configs for `nginx`
    * __letsencrypt__: generates TLS certificates for `nginx` through the Let's Encrypt service

  While edd is running, you can also get a list of its services by runnning `docker-compose ps`
  from the `docker_services` directory. Each container will be listed in the "Name" column of the
  output, with a name generated by Docker Compose. The name consists of three parts separated
  by underscores:
    * the "project", by default the current directory, may be set using the `-p` flag to
      `docker-compose` or the `COMPOSE_PROJECT_NAME` environment variable;
    * the "service" name;
    * a counter value, to distinguish multiple containers scaled beyond the first;
  As an example, the container named `edd_worker_1` is the first instance of the `worker`
  service in the `edd` project. You can also use `docker ps` from anywhere on the host to get a
  similar listing, though it will include all containers running on your host, not just those
  defined by EDD.

* __Starting and Stopping__
    * Recommended to use the `start-edd.sh` and `stop-edd.sh` scripts, rather than directly running
      `docker-compose` commands.

* __`docker-compose` commands__
    * View logs: `docker-compose logs [service]`
    * See more in the [Docker Compose documentation][8]

* __Running multiple copies of EDD__

  If running multiple copies of EDD on one host, you _must_ use the `COMPOSE_PROJECT_NAME`
  environment variable or add the `-p` flag to every `docker-compose` command. Otherwise, each copy
  will create containers named similar to `dockerservices_edd_1`, because of the name of the
  `docker_services` subdirectory containing the Docker-related files. Commands intended for other
  copies will execute on the first launched copy, and not work as expected.

* __Determining the local URL for EDD's web interfaces:__

  If using a Linux host or Docker for Mac, use the hostname `edd.lvh.me`.
    * __EDD:__ `http://edd.lvh.me/`
    * __EDD's REST API:__ `http://edd.lvh.me/rest/` (if enabled)
    * __Solr:__ `http://solr.lvh.me/` (if configured in `docker-compose.override.yml`)
    * __Flower:__ `http://flower.lvh.me/` (if configured in `docker-compose.override.yml`)
    * __RabbitMQ Management Plugin:__ `http://rabbitmq.lvh.me/` (if configured in
      `docker-compose.override.yml`)

* __Interfacing with EDD's services from the command line:__
    * Run commands in __existing__ containers with `docker-compose exec $SERVICE $COMMAND`,
      e.g.: `docker-compose exec edd python /code/manage.py shell`
    * Restart misbehaving services with: `docker-compose restart $SERVICE`

---------------------------------------------------------------------------------------------------

[1]:    http://brew.sh
[2]:    https://docker.io
[3]:    https://docs.docker.com/machine/overview/
[4]:    http://typescriptlang.org/
[5]:    https://docs.docker.com/engine/installation/linux/
[6]:    docs/Configuration.md
[7]:    https://github.com/JBEI/ice
[8]:    https://docs.docker.com/compose/overview/
[9]:    https://bower.io/
