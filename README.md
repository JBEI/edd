# Experiment Data Depot

The Experiment Data Depot (EDD) is a web-based repository of processed data obtained via
experimentation.  See the deployed version at [edd.jbei.org][1].
    
## Contents
* System Pre-requisites
   * [Passwords](#Passwords)
   * Mac OSX
       * [XCode](#XCode)
       * [HomeBrew](#HomeBrew)
       * [Docker](#Docker)
       * [Running EDD](#Run_OSX)
   * [Debian (for deployment)](#Debian)
* [Helpful Python Packages](#Helpful_Python)
* [Build Tools](#BuildTools)
* [Configuring social logins](#Social)

---------------------------------------------------------------------------------------------------

## System Pre-requisites

* Passwords <a name="Passwords"/>
    * Get required passwords from a teammate or JBEI sysadmin.
        * jbei_auth - to configure LDAP binding
        * edduser - the password to the production EDD database instance. You'll need this to copy
          its data for local development work.
        * edd ice key - used by edd to authorize REST API calls to ICE
* Local git repo config
    * The typescript build process includes some comments that will change with every rebuild.
      These comments will cause unnecessary merge conflicts if allowed into the repo, so the
      project includes some configuration to strip them out.
    * Upon cloning a repo for the first time (or updating a repo from before filtering), do:
        * `.gitconfig.sh`
        * If updating a repo, you may need to add changed files to the index once
        * May need to install a newer version of git; [Homebrew](#HomeBrew) instructions below
          will install a more recent version on Macs.
   
### Mac OS X
This section contains directions for setting up a development environment on EDD in OSX.

* XCode <a name="XCode"/>
    * Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
* [Homebrew][2] <a name="HomeBrew"/>
    * Homebrew is a package manager for OS X. The Homebrew packages handle installation and
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
* [Docker][29] <a name="Docker"/>
    * Docker is a container virtualization platform: all software, configuration, and dependencies
      required to run a service are packaged into standalone images. These images are ready to run
      immediately upon being copied to a new host running a Docker daemon.
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
        * See more in the [Docker Machine documentation][30]
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
    * The default virtualbox settings allocate 1 CPU core and 1 GB RAM for the container host VM.
      You will probably want to increase the allocated resources, by stopping the VM and changing
      settings in the "System" tab of the virtualbox Settings GUI.
    * Create a `./edd/settings/local.py` file, based on the example in
      `./edd/settings/local.py-example`
        * Any local-specific settings changes will go here. The local settings are loaded last,
          and will override any settings contained in other files in the `./edd/settings` folder.
    * Create `secrets.env` based on the example in `secrets.env-example`
        * the value of `SECRET_KEY` is the Django server key; pick some random text
        * `secret1` is a password you choose for the `postgres` PostgreSQL user
        * `secret2` is a password you choose for the `edduser` PostgreSQL user
        * `secret3` is a password you choose for the `edd_user` RabbitMQ user
        * `secret4` is a password you choose for the `flower` Flower user
        * the value of `ICE_HMAC_KEY` is the key used to authenticate to ICE; set this to the
          secret used in the ICE instance you connect to for test
        * the value of `LDAP_PASS` is the password for the `jbei_auth` user by default; you may
          use your own password by including in your `./edd/settings/local.py`:
          `AUTH_LDAP_BIND_DN = 'lblEmpNum=[your-six-digit-id],ou=People,dc=lbl,dc=gov'`
    * Run the initialization configuration through Docker Compose:
        * `docker-compose -f docker-init.yml up`
        * This will create the data volumes used to run EDD, and run setup tasks to make them
          ready for use.
        * After some time, you should see a message instructing you to
          `docker-compose -f docker-init.yml down`. Do that.
* Running EDD <a name="Run_OSX"/>
    * `docker-compose` commands
        * Build all services:  `docker-compose build`
        * Startup all services in detached mode: `docker-compose up -d`
        * View logs: `docker-compose logs`
        * Bringing down all services: `docker-compose down`
        * See more in the [Docker Compose documentation][32]
	* Other useful sample commands:
	    * Connect to the postgres command line: docker exec -it edd_postgres_1  psql -U postgres
    * Startup in new shell sessions
        * Load the Docker environment with:
          `eval "$(docker-machine env default)"`
        * (Re)build the container images with current code:  `docker-compose build`
        * Start EDD services:  `docker-compose up -d`
            * To run commands, use `docker-compose run $SERVICE $COMMAND`, e.g.:
              `docker-compose run edd python manage.py shell`
            * To access services, use the IP listed in `docker-machine ls`, e.g.
                * access EDD via https://192.168.99.100/
                * access Solr via http://192.168.99.100:8983/solr/
                * access RabbitMQ Management Plugin via http://192.168.99.100:15672/
            * Restart misbehaving services with:  `docker-compose restart $SERVICE`


---------------------------------------------------------------------------------------------------

### Debian (for deployment) <a name="Debian"/>

* `sudo apt-get install docker.io` for Docker daemon
* Create a user for running EDD; assuming user `jbeideploy` exists for further instructions
* As `jbeideploy`, check out code to `/usr/local/edd`
    * Create a `./edd/settings/local.py` file, based on the example in
      `./edd/settings/local.py-example`
        * Any local-specific settings changes will go here. The local settings are loaded last,
          and will override any settings contained in other files in the `./edd/settings` folder.
    * Create `secrets.env` based on the example in `secrets.env-example`
        * `SECRET_KEY` is the Django server key; pick some random text
        * `secret2` is a password you choose for the `edduser` PostgreSQL user
        * `secret3` is a password you choose for the `edd_user` RabbitMQ user
        * `secret4` is a password you choose for the `flower` Flower user
        * `ICE_HMAC_KEY` is the key used to authenticate to ICE; set this to the secret used
          in the ICE instance you connect to for test
        * `LDAP_PASS` is the password for the `jbei_auth` user by default; you may use your own
          password by including in your `./edd/settings/local.py`:
          `AUTH_LDAP_BIND_DN = 'lblEmpNum=[your-six-digit-id],ou=People,dc=lbl,dc=gov'`
    * TODO: instructions for deploying to a remote docker daemon
 
---------------------------------------------------------------------------------------------------

## Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in `./edd/settings/local.py` INSTALLED_APPS


## Build Tools <a name="BuildTools"/>

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

* EDD uses [TypeScript][19] for its client-side interface
    * Dependencies are listed in `packages.json` and may be installed with `npm install`
    * Compile changes in `*.ts` to `*.js` by simply running `grunt` from the edd base directory


## Configuring Social Logins <a name="Social"/>
* For broad overview, refer to the [django-allauth documentation][25].
* To use a new provider:
    * Add the provider application to `INSTALLED_APPS`
    * Put logos in `./main/static/main/images/` and update styles in `./main/static/main/login.css`
    * From the admin site, add a new Social application, using Client ID and Secret Key from
      provider
        * [Github registration][26]
        * [Google registration][27]
        * [LinkedIn registration][28]
        * Each provider may require additional details about the application, allowed domains
          and/or URLs, etc.


[1]:    https://edd.jbei.org
[2]:    http://brew.sh
[3]:    https://pip.pypa.io
[4]:    http://virtualenvwrapper.readthedocs.org/en/latest/install.html
[5]:    http://java.oracle.com
[6]:    https://cwiki.apache.org/confluence/display/solr/Installing+Solr
[7]:    https://cwiki.apache.org/confluence/display/solr/Upgrading+a+Solr+4.x+Cluster+to+Solr+5.0
[8]:    http://wiki.apache.org/solr/Solr.xml%204.4%20and%20beyond
[9]:    http://wiki.apache.org/solr/CoreAdmin
[10]:   http://crsmithdev.com/arrow/
[11]:   https://cryptography.io/en/latest/
[12]:   https://www.djangoproject.com/
[13]:   https://pythonhosted.org/django-auth-ldap/index.html
[14]:   https://django-extensions.readthedocs.org/en/latest/
[15]:   https://pypi.python.org/pypi/django-threadlocals/
[16]:   http://docs.python-requests.org/en/latest/
[17]:   http://initd.org/psycopg/
[18]:   http://www.python-ldap.org/
[19]:   http://typescriptlang.org/
[20]:   https://www.rabbitmq.com/man/rabbitmqctl.1.man.html
[21]:   https://github.com/mher/flower/wiki/Authentication
[22]:   http://flower.readthedocs.org/en/latest/config.html
[23]:   http://lucene.apache.org/solr/
[24]:   http://apple.stackexchange.com/questions/119711/why-mac-os-x-dont-source-bashrc
[25]:   http://django-allauth.readthedocs.org/en/latest/index.html
[26]:   https://github.com/settings/applications/new
[27]:   https://console.developers.google.com/
[28]:   https://www.linkedin.com/secure/developer?newapp=
[29]:   https://docs.docker.com/engine/quickstart/
[30]:   https://docs.docker.com/machine/overview/
[31]:   http://archive.apache.org/dist/lucene/solr/4.10.4/
[32]:   https://docs.docker.com/compose/overview/
