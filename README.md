# Experiment Data Depot

The Experiment Data Depot (EDD) is a web-based repository of processed biological data obtained
via experimentation.  See the deployed version at [public-edd.jbei.org][1].

## Contents

* [Getting Started](#Getting_Started)
* [Mac OS Setup](#MacOS_Setup)
    * [XCode](#XCode)
    * [HomeBrew](#HomeBrew)
    * [Docker](#Docker)
* [Linux / Debian](#Debian)
* Common Setup Tasks
* Running EDD
* For Developers
* Common Maintenance/Development Tasks
* Upgrading EDD

For a more detailed reference for EDD's low-level configuration options, see [Configuration][8].
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


### Mac OS Setup <a name="MacOS_Setup"/>

This section contains directions for setting up a development environment for EDD on Mac OS.

* XCode <a name="XCode"/>
    * Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
* Homebrew <a name="HomeBrew"/>
    * [Homebrew][4] is a package manager for OS X. The Homebrew packages handle installation and
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
    * Set up Docker Machine; a tool to manage Docker daemons running on other hosts.
        * Create a VM to run containers:
          `docker-machine create --driver virtualbox default`
        * Confirm VM is running with:
          `docker-machine ls`
        * Stop and start VMs with:
          `docker-machine stop default` and `docker-machine start default`
        * Configure the `docker` command to use the virtualbox VM as the container host:
          `eval "$(docker-machine env default)"`
        * See more in the [Docker Machine documentation][5]
    * Running Docker images
        * Verify Docker is configured by running: `docker run --rm hello-world`
            * Get `docker: command not found`? You didn't successfully install from Homebrew.
            * Get `docker: Cannot connect to the Docker daemon.`? You have not run the `eval`
              command in the Docker Machine section.
    * Try the command `docker-compose`
        * If you get `Illegal instruction: 4`, you have an older Mac that cannot run with the
          compiled binary provided by the Homebrew packages; run `pip install docker-compose` to
          fix the error.
        * Normal output is helptext showing the commands to use with `docker-compose`.
    * Setting up Docker for EDD
        * The default virtualbox settings allocate 1 CPU core and 1 GB RAM for the container host
          VM. This should be fine for small or testing deployments. For better performance, it is
          recommended to increase the allocated resources to at least 2 CPU and 2 GB RAM, by
          stopping the VM and changing settings in the "System" tab of the virtualbox
          Settings GUI.
* Complete "Common Setup Tasks" below to get EDD configured and running for the first time
* Complete the "For Developers" section below for a few additional development configurations

### Linux / Debian Setup<a name="Debian"/>

This section contains directions for setting up a production deployment for EDD on Debian.

* Follow the Docker-recommended instructions for [installing the daemon for your distro][7].
    * There is a `docker` package in the Debian apt repos. It isn't [Docker][2]!
    * There is a `docker.io` package too; this can work, but it will generally be outdated.
* Create a user for running EDD; assuming user `jbeideploy` exists for further instructions.
* As `jbeideploy`, check out code to `/usr/local/edd/` (this will be `$EDD_HOME` below)
* Set up your local docker-machine to manage a remote EDD deployment
    * _If using Docker client on a different host, i.e. with `docker-machine`_
        * Ensure you have a public key in `jbeideploy`'s `~/.ssh/authorized_keys2` file
        * Create an environment for the remote host (replace `{REMOTE_HOST}` with hostname or IP)

              docker-machine create --driver generic \
                  --generic-ip-address {REMOTE_HOST} \
                  --generic-ssh-user jbeideploy \
                  --generic-ssh-key /path/to/private.key \
                  {NAME_OF_ENVIRONMENT}

        * Activate the machine with `eval $(docker-machine env {NAME_OF_ENVIRONMENT})`
        * Set environment variable on Docker client host `EDD_HOST_DIR` to `$EDD_HOME`
            * Prepend `EDD_HOST_DIR=/usr/local/edd/` to any `docker-compose` commands
            * Alternatively, `export EDD_HOST_DIR=/usr/local/edd/` before running commands
            * The trailing `/` is important!
    * Test by running `docker-compose`
* Complete "Common Setup Tasks" below now that Docker is in place


### Common Setup Tasks
After you have all of the Docker tools minimally configured for your environment, perform the
following steps in the EDD checkout directory to configure EDD and launch it for the first time.

* __Run `./init-config.sh`__
  This script will:
    * Test your git configuration
    * Copy sample configuration files
    * Generate random passwords for use in autoconfiguring EDD's Docker services

* __Configure `secrets.env`__

  To save work later, you may want to manually edit `secrets.env` to set memorable passwords
  of your choosing for EDD services whose web interfaces are exposed via EDD's nginx proxy,
  or that you intend to expose on your host. For example, services such as
  RabbitMQ and Flower Passwords are established during the Docker image builds prior to the
  first run, so make certain you've edited these files before the first build/run, or that
  you completely remove and rebuild the related Docker containers/volumes if you change
  these passwords without taking note of the old ones. You can also directly iterface with
  the services later to change their passwords, but that's significantly more work if you
  aren't already familiar with them. You'll also need to update this file when configuring
  some passwords to enable EDD services to communicate with each other.

  After setting passwords in `secrets.env`, you can come back and perform more detailed
  configuration of EDD and Docker later without adding too much work.

* __Build EDD's Docker Images__
    * Make sure you're targeting the correct Docker machine. In the local development example
      above, run `eval "$(docker-machine env default)"`. If you are using Docker Compose to launch
      EDD on a remote host, your command will be different, and you should make sure you are
      executing Docker on the correct host.
    * Run `docker-compose build` to build the Docker containers for EDD. This will take a while. In
      the future, we may publish pre-built Docker images that will prevent you from having to take
      this step.
    * You can actually skip this step and just run the command to start EDD, but it's included here
      to familiarize developers / maintainers with the Docker build process in case they have to
      run it later.
* __Launch EDD's services__

  Run `docker-compose up -d`. At this point, you can use Docker commands to view the logs for
  each service or to locate the IP for viewing EDD's web interface.

  See "Running EDD" below for a list of helpful commands. If you skipped the previous step, this
  command will take significantly longer the first time you run it, since Docker has to initially
  build / configure the EDD services before they can run.

* __Perform other [configuration][8] as desired__

  For example, by default, EDD will launch with an empty database, so you may want to use
  environment variables to load an existing one.
    * If you're starting from a blank database, use the web interface to configure EDD for your
      institution.
    * If you haven't loaded EDD from an existing database, you'll need to create an administrator
      account from the command line that you can then use to create measurement types, units, and
      other user accounts to get the system going.
        1. Create an administrator account:
          `docker-compose exec appserver python manage.py createsuperuser`
        2. Configure EDD using the web interface

           Log into EDD's web interface using an administrator account. Go to "Administration"
           at top left, then use the interface to create a minimal set of Users, Units,
           Measurement Types, Metadata, etc. that allow users to import their data.

           TODO: We plan to add more to this section of the documentation over time to describe
           how these entries are used and when / how to edit them.

 * __Install and configure a supporting [ICE][10] deployment__

   EDD requires ICE as a reference for strains used in EDD's experiments. You will not be able to
   create lines in your EDD studies until EDD can successfully communicate/authenticate with ICE.
    * Follow ICE's directions for installation/setup
    * Configure an HMAC key for EDD's use. EDD's default configuration assumes a key ID of 'edd',
      but you can change it by overriding the value of `ICE_KEY_ID` in your `local.py`
    * TODO: insert key generation directions here, or reference ICE directions.
    * See directions under Common 'Maintenance/Development Tasks' to test EDD/ICE communication


### Running EDD

This section is a quick reference for commonly helpful commands for running / developing EDD. Many
of them use Docker Compose and other related Docker tools that aren't fully documented here.

* __Docker services__

  `docker-compose` is the recommended tool for controlling EDD services. `docker-compose.yml`
  defines the list of services as top-level entries under the 'services' line.

  For quick reference, at the time of writing the provided services are:
    * appserver: runs EDD itself
    * postgres: provides EDD's database
    * redis: provides the cache back-end for EDD. At the time of writing, EDD uses redis to map
      static resource names to URLs and to store session data.
    * solr: provides a search index for EDD studies, users, and measurement types
    * rabbitmq: messaging bus that supports Celery
    * flower: management / monitoring application for Celery
    * smtp: main server that supports emails from EDD
    * worker: runs the EDD Celery worker for asynchronous processing. At the time of writing,
      EDD uses Celery to communicate with ICE and to keep the UI respensive during file imports.
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

  To access services, use the IP listed in the
  output from `docker-machine ip default`. By default on most systems, use:
    * __EDD:__ https://192.168.99.100/
    * __EDD's REST API:__ https://192.168.99.100/rest/ (if enabled)
    * __Solr:__ https://192.168.99.100/solr/
    * __Flower:__ https://192.168.99.100/flower/
    * __RabbitMQ Management Plugin:__ https://192.168.99.100/rabbitmq/

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

### For Developers:

* There's configuration already in place to help you work on EDD. Uncomment support for the Django
  debug toolbar in the sample `local.py` file
* The EDD makes use of Node.js and grunt for builds; it would be a good idea to:
    * OS X:
        * Install node; this is already included in the Brewfile
        * Install the grunt command line: `npm install -g grunt-cli`
        * Install node packages to the local folder: `npm install`
    * Debian:
        * `sudo apt-get install node`
        * This will install nodejs.  It might be convenient for you to link this to ‘node’
          on the command line, but there is sometimes already a program
          ’/usr/sbin/ax25-node’ linked to node.
          This is the “Amateur Packet Radio Node program” and is probably not useful to you.
          (https://packages.debian.org/sid/ax25-node)
          Check on this link with `ls -al /usr/sbin/n*` and `rm /usr/sbin/node` if necessary, then
          `sudo ln -s /usr/bin/nodejs /usr/bin/node`
        * `sudo apt-get install npm`
        * `sudo npm install -g grunt-cli`
        * `sudo npm install grunt`
* EDD uses [TypeScript][6] for its client-side interface
    * Dependencies are listed in `packages.json` and may be installed with `npm install`
    * Compile changes in `*.ts` to `*.js` by simply running `grunt` from the edd base
      directory. It will rebuild the TypeScript and automatically run Django's `collectstatic`
      command to update the Javascript files in use by your instance

#### Additional Build Process Setup

The TypeScript build process includes some comments that will change with every rebuild. These
comments will cause unnecessary merge conflicts if allowed into the repo, so the project includes
some configuration to strip them out.

After cloning the repo for the first time run `.gitconfig.sh`. If updating an existing repo, you
may need to add changed files to the index once. Some bundled git versions are outdated and cannot
use the configuration contained in the script; you may need to install a newer version of git;
[Homebrew](#HomeBrew) instructions above will install a more recent version on Macs.

#### Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in `./edd/settings/local.py` INSTALLED_APPS

### Common Maintenance/Development Tasks

Some of these sample commands will only work as written at JBEI, but should serve as useful
examples for common development tasks. Directions assume that Docker containers are already
running in the development environment.

* __Run automated tests__
    * Python tests: `docker-compose exec appserver python manage.py test`
    * Javascript Tests <a name="Javascript Tests"/>
        * run `grunt test` to test javascript files.
        * run `grunt screenshots` to test graphs
        * run `webdriver-manager start` in one command window and `grunt e2e-test` in another for
          E2E tests
    * Test EDD/ICE communication: `docker-compose exec appserver manage.py test_ice_communication`
    * Test email configuration
        * `python manage.py send_test_email your.email@somewhere.com`
        * `python manage.py sendtestemail --admins`
        * `python manage.py sendtestemail --managers`

* __Create an unprivileged test account__
    * `docker-compose exec appserver python manage.py edd_create_user`.

* __Dump the production database to file and load into a local test deployment__
    * Create the dump file

          pg_dump -h postgres.jbei.org -d eddprod -f edd-prod-dump.sql -U your_username'

    * Load the dump file

          docker-compose down
          POSTGRES_DUMP_FILE=edd-prod-dump.sql docker-compose up -d

* __Rebuild Solr indexes:___ `docker-compose exec appserver manage.py edd_index`.

  This shouldn't normally be required, but can be helpful following unanticipated software errors.

* __Run development / maintenance level scripts__

  See [separate directions][9] for configuring a standalone Python environment to run these
  scripts, and for the list of available scripts.


### Upgrading EDD

To upgrade EDD, perform the following simple steps. Some upgrades may not require all these steps,
but this is the safest upgrade process (though also the most time-consuming):

1. Schedule a time for the upgrade when few or no users will be affected. At the time of writing,
  a successful build and migration/indexing processes may take upwards of 30-40 minutes, so leave
  some overhead and plan for EDD to be down for about an hour.
2. Make sure you're targeting the correct Docker machine. In the development example above, you
  would run:

      eval $(docker-machine env default)

3. Run `git status` and make a note of the result in case you need to abort the upgrade for any
  reason.
4. Get the latest code: `git checkout [branch]`.
5. Rebuild the Docker images. This step can often be skipped, but it's safest to execute it anyway
  in case EDD's dependencies have changed: `docker-compose build`. Rebuilding will go quickly in
  cases where there is little work to do. At other times this step may take upwards of 30 minutes,
  but is safe to perform while EDD's Docker containers are still runnning.
6. Stop the current instance and all supporting services: `docker-compose down`
7. Back up EDD's database in case of any unanticipated migration failures.
8. Restart EDD and supporting services. `docker-compose up -d`. This will take longer than normal
   following an upgrade, since Docker will automatically run any pending database migrations,
   relaunch the containers, and rebuild the SOLR indexes. You can watch the `appserver` container's
   log for a good overview of progress, e.g. `docker-compose logs -f appserver`
9. Log into the web interface and exercise a few features to confirm the upgrade was successful.


---------------------------------------------------------------------------------------------------

[1]:    https://public-edd.jbei.org
[2]:    https://docker.io
[3]:    https://docs.docker.com/compose/overview/
[4]:    http://brew.sh
[5]:    https://docs.docker.com/machine/overview/
[6]:    http://typescriptlang.org/
[7]:    https://docs.docker.com/engine/installation/linux/
[8]:    docs/Configuration.md
[9]:    jbei/README.md
[10]:   https://github.com/JBEI/ice