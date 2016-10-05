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

For a more detailed reference for EDD's low-level configuration options,
see [Configuration][8]. If you're just starting out with
EDD, follow directions here first.

---------------------------------------------------------------------------------------------------

## Getting Started <a name="#Getting_Started"/>

With [Docker][2] and [docker-compose][3] installed, launching the entire EDD software stack is as simple as cloning the git repository and running:

    ./init-config.sh
    docker-compose up -d

Without additional configuration, the launched copy of EDD will be using default options, so some functions 
(e.g. TLS support, external authentication, referencing an ICE deployment) won't work.  See below for more detailed instructions for installing Docker
and configuring EDD for your deployment environment.


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
    * Create a `$EDD_HOME/edd/settings/local.py` file, based on the example in
      `$EDD_HOME/edd/settings/local.py-example`
        * Any local-specific settings changes will go here. The local settings are loaded last,
          and will override any settings contained in other files in the `$EDD_HOME/edd/settings`
          folder.
    * Create `secrets.env` based on the example in `$EDD_HOME/secrets.env-example`
        * `SECRET_KEY` is the Django server key; pick some random text
        * `secret1` is a password you choose for the `postgres` PostgreSQL user
        * `secret2` is a password you choose for the `edduser` PostgreSQL user
        * `secret3` is a password you choose for the `edd_user` RabbitMQ user
        * `secret4` is a password you choose for the `flower` Flower user
        * `ICE_HMAC_KEY` is the key used to authenticate to ICE; set this to the secret used
          in the ICE instance you connect to for test
        * `LDAP_PASS` is the password for the `jbei_auth` user by default; you may use your own
          password by including in your `$EDD_HOME/edd/settings/local.py`:
          `AUTH_LDAP_BIND_DN = 'lblEmpNum=[your-six-digit-id],ou=People,dc=lbl,dc=gov'`
* Set up your local docker-machine to manage a remote EDD deployment
    * _If using docker client on a different host, i.e. with docker-machine_
        * Ensure you have a public key in `jbeideploy`'s `~/.ssh/authorized_keys2` file
        * Create an environment for the remote host (replace `{REMOTE_HOST}` with hostname or IP)

              docker-machine create --driver generic \
                  --generic-ip-address {REMOTE_HOST} \
                  --generic-ssh-user jbeideploy \
                  --generic-ssh-key /path/to/private.key \
                  {NAME_OF_ENVIRONMENT}

        * Activate the machine with `eval $(docker-machine env {NAME_OF_ENVIRONMENT})`
        * Set environment variable on docker client host `EDD_HOST_DIR` to `$EDD_HOME`
            * Prepend `EDD_HOST_DIR=/usr/local/edd/` to any `docker-compose` commands
            * Alternatively, `export EDD_HOST_DIR=/usr/local/edd/` before running commands
            * The trailing `/` is important!
    * Test by running `docker-compose`
* Complete "Common Setup Tasks" below now that Docker is in place
			

### Common Setup Tasks
After you have all of the Docker tools minimally configured for your environment, perform the following steps in the EDD checkout directory to configure EDD and launch it for the first time.

TODO: update me for init_config.sh

* Copy `./edd/settings/local.py-example` to `./edd/settings/local.py`, then edit to meet your deployment needs
    * Any local-specific settings changes will go here. The local settings are loaded last, and will override any settings contained in other files in the `./edd/settings` folder.
	* At a minimum, you should override ADMINS=MANAGERS=(your_data_here) so you get automated emails from EDD when errors occur.
* Create a `secrets.env` based on the example in `secrets.env-example`
    * the value of `SECRET_KEY` is the Django server key; pick some random text
    * `secret1` is a password you choose for the `postgres` PostgreSQL user
    * `secret2` is a password you choose for the `edduser` PostgreSQL user
    * `secret3` is a password you choose for the `edd_user` RabbitMQ user
    * `secret4` is a password you choose for the `flower` Flower user
    * the value of `ICE_HMAC_KEY` is the key used to authenticate to ICE; set this to the
      secret used in the ICE instance you connect to for test
    * the value of `LDAP_PASS` is the password for the `jbei_auth` user by default; you
      may use your own password by including in your `./edd/settings/local.py`:
      `AUTH_LDAP_BIND_DN = 'lblEmpNum=[your-six-digit-id],ou=People,dc=lbl,dc=gov
* Build EDD's docker images
   * Make sure you're targeting the correct Docker machine. In the local development example above, run `eval "$(docker-machine env default)"`. If you're using docker-compose to launch EDD on a remote host, your command will be different, and you should make sure you're executing docker on the correct host.
   * Run `docker-compose build` to build the Docker containers for EDD. This will take a while. In the future, we may publish pre-built Docker images that will prevent you from having to take this step.
* Launch EDD's services by running `docker-compose up -d`. At this point, you can use Docker commands to view the logs for each service or to locate the IP for viewing EDD's web interface. See "Running EDD" below for a list of helpful commands.
* Perform other [configuration][8] as desired for your EDD instance. 
  For example, by default, EDD will launch with an empty database, so you may want to use environment variables to load an existing one.
* If you're starting from a blank database, use the web interface to configure EDD for your institution.
	If you haven't loaded EDD from an existing database, you'll need to create an administrator account from the command line that you can then use to create measurement types, units, and other user accounts to get the system going. 
	
	1. Create an administrator account:
      * Run the command `docker-compose exec appserver /code/manage.py shell`
      * Execute the following code to create a user, then CRTL^D to exit

            from main.models import User
            user = User.objects.create_user(
                'admin_user',  # username
                'admin_user@example.com',  # email
                'insert_a_secure_password_here',  # password
                is_superuser=True, 
                is_staff=True
            )
			
    2. Configure EDD using the web interface.
	Log into EDD's web interface using an administrator account.  Go to "Administration" at top left, then use the interface to create a minimal set of Users, Units, Measurement Types, Metadata, etc that allow users to import their data. TODO: We plan to add more to this section of the documentation over time to describe how these entries are used and when / how to edit them.
  

### Running EDD
This section is a quick reference for commonly helpful commands for running / developing EDD. Many of them use docker-compose and other related Docker tools that aren't fully documented here.

* Docker services
  `docker-compose` is the recommended tool for controlling EDD services. `docker-compose.yml` defines the list of services as top-level entries under the 'services' line.  
  For quick reference, at the time of writing the provided services are:
	   * appserver: runs EDD itself
	   * postgres: provides EDD's database
	   * redis: provides a static file cache for EDD
	   * solr: provides a search cache for EDD studies, users, and measurement types
	   * rabbitmq: messaging bus that supports Celery
	   * flower: management / monitoring application for Celery
	   * smtp: provides administrative email notifications for EDD errors
	   * worker: runs the EDD Celery worker for asynchronous processing. At the time of writing, EDD uses Celery to communicate with ICE and to keep the UI respensive during file imports.
  While edd is running, you can also get a list of its services by runnning `docker ps`. Each service will be listed in the "NAMES" column of the output, with a prefix/postfix automatically added by Docker-compose: e.g. "edd_appserver_1" is the first instance of the "appserver" service running launched from a directory called "edd".
* `docker-compose` commands
    * Build all services:  `docker-compose build`
    * Startup all services in detached mode: `docker-compose up -d` (recommended to keep muliple service logs from cluttering the screen)
    * View logs: `docker-compose logs [service]`
    * Bringing down all services: `docker-compose down`
    * See more in the [Docker Compose documentation][3]
    * Compose may complain about a missing variables. If this bothers you, run an export
      command to assign an empty string to each: `export EDD_HOST_DIR=`
* Determining the local URL for EDD's web interfaces:
    To access services, use the IP listed in `docker-machine ip default`, e.g.
        * EDD: https://192.168.99.100/
		* EDD's REST API: https://192.168.99.100/rest/ (if enabled)
        * Solr: http://192.168.99.100/solr/
		* Flower: https://192.168.99.100/flower/
        * RabbitMQ Management Plugin: http://192.168.99.100/rabbitmq
* Interfacing with EDD's services from the command line:
        * To run commands in __new__ containers, use `docker-compose run $SERVICE $COMMAND`,
          e.g.: `docker-compose run edd python manage.py shell`
        * Run commands in __existing__ containers with `docker-compose exec $SERVICE $COMMAND`,
          e.g.: `docker-compose exec appserver python manage.py shell`
        * Restart misbehaving services with:  `docker-compose restart $SERVICE`		
        * Other useful sample commands:
            * Connect to the Postgres command line: `docker-compose exec postgres psql -U postgres`
            * Connect to the Django shell: `docker-compose exec appserver python manage.py shell`
* Running Docker commands in new shell sessions
    * The `docker` command will look for a Docker daemon running on the local machine by
      default. Mac hosts currently must use a daemon running in a VirtualBox guest VM. Load
      the Docker environment on the guest with:

          eval "$(docker-machine env default)"

    * Docker will re-use built images, so changes to code may not be reflected in running
      containers. (Re)build the container images with current code using:

          docker-compose build

### For Developers:
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
    * Compile changes in `*.ts` to `*.js` by simply running `grunt --force` from the edd base
    directory. It will rebuild the TypeScript and automatically run Django's collectstatic to 
	update the Javascript files in use by your instance

#### Additional Build Process Setup
The typescript build process includes some comments that will change with every rebuild. These
comments will cause unnecessary merge conflicts if allowed into the repo, so the project includes
some configuration to strip them out.

After cloning the repo for the first time run `.gitconfig.sh`. If updating an existing repo, you may need to add changed files to the index
once. Some bundled git versions are outdated and cannot use the configuration contained in the
script; you may need to install a newer version of git; [Homebrew](#HomeBrew) instructions above
will install a more recent version on Macs.

#### Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in `./edd/settings/local.py` INSTALLED_APPS
		
### Common Maintenance/Development Tasks

Some of these sample commands will only work as written at JBEI, but should serve as useful
examples for common development tasks. Directions assume that Docker containers are already
running in the development environment.

* Run automated tests:
   * Python tests: `docker-compose exec appserver python manage.py test`
   * Javascript tests
      * run `$ grunt test` to test javascript files.
      * run `$ grunt screenshots` to test graphs
   * Test EDD/ICE communication: `docker-compose exec appserver manage.py test_ice_communication`
		  
* Create an unprivileged test account
    * Run the command `docker-compose exec appserver /code/manage.py shell`
    * Execute the following code to create a user, and exit

          from main.models import User
          User.objects.create_user(
              'unprivileged_user',  # username
              'test_user@example.com',  # email
              'insecure_pwd_ok_for_local_testing',  # password
          )

    * Attempt login using the UI -- this is necessary to enable the following step
    * Run the command `docker-compose exec postgres psql -U postgres edd`
    * Execute the following code to enable the user, and exit

          UPDATE account_emailaddress SET verified = true WHERE email = 'test_user@example.com';

* Dump the production database to file and load into a local test deployment
    * Create the dump file with this command

          pg_dump -h postgres.jbei.org -d eddprod -f edd-prod-dump.sql -U your_username'

    * Load the dump file

          docker-compose down
          POSTGRES_DUMP_FILE=edd-prod-dump.sql docker-compose up -d
          
* Rebuild SOLR indexes: `docker-compose exec appserver manage.py edd_index`

* Run development / maintenance level scripts: see [separate directions][9] for configuring a standalone Python environment to run these scripts, and for the list of available scripts.


		  
### Upgrading EDD

To upgrade EDD, perform the following simple steps. Some upgrades may not require all these steps,
but this is the safest upgrade process (though also the most time-consuming):
1. Schedule a time for the upgrade when few or no users will be affected.
   At the time of writing, a successful build and migration/indexing processes may take
   upwards of 30-40 minutes, so leave some overhead and plan for EDD to 
   be down for about an hour.
1. Make sure you're targeting the correct docker machine. In the development example above, you'd run:
    eval `$(docker-machine env default)`
2. Stop the current instance and all supporting services: `docker-compose down`
3. Consider backing up the database in case of unanticipated migration failures.
3. Get the latest code: `git checkout [branch]`
4. Rebuild the Docker images. This step can often be skipped, but it's safest to execute it anyway in case EDD's dependencies have changed: `docker-compose build`
5. Restart EDD and supporting services. `docker-compose up -d`. This will take longer than normal following an upgrade, since Docker will automatically run any pending database migrations, relaunch the containers, and rebuild the SOLR indexes. You can watch the `appserver` container's log for a good overview of progress, e.g. `docker-compose logs -f appserver`
6. Log into the web interface and exercise a few features to confirm the upgrade was successful.


---------------------------------------------------------------------------------------------------

[1]:    https://public-edd.jbei.org
[2]:    https://docker.io
[3]:    https://docs.docker.com/compose/overview/
[4]:    http://brew.sh
[5]:    https://docs.docker.com/machine/overview/
[6]:    http://typescriptlang.org/
[7]:    https://docs.docker.com/engine/installation/linux/
[8]:    Configuration.md
[9]:    jbei/README.md