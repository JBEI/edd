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
       * [Required Debian Packages](#Debian_Packages)
       * [Configure LDAP](#Configure_LDAP)
       * [Check Out Code](#Check_Out)
       * [Python packages](#Python_Packages_Deb)
       * [Solr/Tomcat](#Solr_Tomcat_Deb)
       * [Django](#Django_Deb)
       * [Apache Setup](#Apache_Deb)
       * TODO: update TOC when Debian directions are complete
* [Helpful Python Packages](#Helpful_Python)
* [Build Tools](#BuildTools)
* [Solr Tests](#Solr_Test)
* [Required Python Package Reference](#PythonPackages)
* [Setting up multiple Apache VHOST](#Apache_VHOST)
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
    Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
* [Homebrew][2] <a name="HomeBrew"/>
    * To install:
      `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
      and follow prompts.
    * `brew doctor` should say `Your system is ready to brew.` or describe any problems.
    * From the edd code directory, `brew bundle` should install additional software dependencies
* [Docker][29] <a name="Docker"/>
    * Will be installed already via Homebrew
    * Set up Docker Machine
        * Create a VM to run containers:
          `docker-machine create --driver virtualbox default`
        * Confirm VM is running with:
          `docker-machine ls`
        * Stop and start VMs with:
          `docker-machine stop default` and `docker-machine start default`
        * Configure the `docker` command to use the VM to run containers with:
          `eval "$(docker-machine env default)"`
        * See more in the [Docker Machine documentation][30]
    * Running Docker images
        * Verify Docker is configured by running:
          `docker run --rm hello-world`
            * Get `docker: command not found`? You didn't successfully install from Homebrew
            * Get `docker: Cannot connect to the Docker daemon.`? You have not run the `eval`
              command in the Docker Machine section.
    * Try the command `docker-compose`
        * If you get `Illegal instruction: 4`, you have an older Mac that cannot run with the
          compiled binary provided by the Homebrew packages; run `pip install docker-compose` to
          fix the error.
        * Normal output is helptext showing the commands to use with `docker-compose`.
* Running EDD <a name="Run_OSX"/>
    * First-time setup
        * If you have not already done so, create a host VM to run containers:
          `docker-machine create --driver virtualbox default`
            * You probably want to give the VM increased resources; default is 1 CPU + 1GB RAM.
              In the VirtualBox application, stop the VM, then edit the settings to increase
              available resources. Restart the VM before proceeding.
        * Load the Docker environment with:
          `eval "$(docker-machine env default)"`
        * Create `secrets.env` based on the example in `secrets.env-example`
            * `SECRET_KEY` is the Django server key; pick some random text
            * `secret2` is a password you choose for the `edduser` PostgreSQL user
            * `secret3` is a password you choose for the `edd_user` RabbitMQ user
            * `secret4` is a password you choose for the `flower` Flower user
            * `ICE_HMAC_KEY` is the key used to authenticate to ICE; set this to the secret used
              in the ICE instance you connect to for test
            * `LDAP_PASS` is the password for the `jbei_auth` user by default; you may use your own
              password by including in your `./settings/local.py`:
              `AUTH_LDAP_BIND_DN = 'lblEmpNum=[your-six-digit-id],ou=People,dc=lbl,dc=gov'`
        * Copy `./settings/local.py-example` to `./settings/local.py`; any local-specific settings
          changes will go here.
        * Create Docker volumes for each of the volumes in `docker-compose.yml`
            * Volumes are containers used to persist data between runs
            * There are `pgdata` and `solrdata` volumes used.
                * `docker volume create --name pgdata`
                * `docker volume create --name solrdata`
            * Initialize the postgres volume
                * Launch a temporary postgres service container with the data volume mounted
                  (replace `secret#` values with appropriate passwords for the `postgres` and
                  `edduser` users, respectively):

                      docker run --name temp_pg -d \
                          -v pgdata:/var/lib/postgresql/data \
                          -e POSTGRES_PASSWORD=secret1 \
                          -e EDD_PGPASS=secret2 \
                          postgres:9.4

                * Connect to the temporary postgres service and run the init script (this will
                  prompt you for the `secret1` password for `postgres` user):

                      cat ./docker_services/postgres/init.sql | \
                          docker exec -i temp_pg psql -U postgres template1

            * Initialize the solr volume
                * Launch a temporary solr service container with the data volume mounted:

                      docker run --name temp_solr -dt \
                          -v solrdata:/opt/solr/server/solr \
                          -p "8983:8983" \
                          solr:5.5

                * Copy configuration from EDD source tree to the `temp_solr` container:

                      tar -cf - -C ./docker_services/solr/cores . | \
                          docker exec -i --user=solr temp_solr \
                          tar xf - -C /opt/solr/server/solr/

                * Restart the solr container to read in the just-added config:

                      docker restart temp_solr

            * Run database migrations
                * Build an image for the EDD codebase:  `docker build -t edd .`
                    * This will take a long time on first build
                    * TODO: set up a Docker image repo, include instructions for use
                * Run the migrate management command using the EDD image linked to the temporary
                  postgres and solr images:

                      docker run --name temp_edd --rm -i \
                          --link temp_pg:postgres \
                          --link temp_solr:solr \
                          --volume `pwd`:/code/ -w /code/ \
                          edd python manage.py migrate

            * Clean-up
                * `docker stop temp_pg && docker rm -v temp_pg`
                * `docker stop temp_solr && docker rm -v temp_solr`
    * `docker-compose` commands
        * Build all services:  `docker-compose build`
        * Startup all services: `docker-compose up -d`
        * View logs: `docker-compose logs`
        * Bringing down all services: `docker-compose down`
        * See more in the [Docker Compose documentation][32]
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

* Required `.deb` packages <a name="Debian_Packages"/>
    * `sudo apt-get install python-pip` for PyPI/pip python package manager
    * `sudo apt-get install postgresql-client` for commands used to copy database
    * `sudo apt-get install libpq-dev` for headers required by psycopg2
    * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers required by
      python-ldap
    * `sudo apt-get install python-dev libffi-dev` for headers required by cryptography
    * `sudo apt-get install libatlas-dev liblapack-dev gfortran` for packages required by SciPy
    * `sudo apt-get install libbz2-dev` for packages required by libsmbl

* Configuration changes: <a name="Debian_Config"/>
    * Create a user for running EDD; assuming user `jbeideploy` exists for further instructions
    * Configure LDAP SSL handling in `/etc/ldap/ldap.conf`
        * Add line `TLS_CACERTDIR   /etc/ssl/certs`
        * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`

* As `jbeideploy`, check out code to `/var/www/${SITE}`

* Python packages <a name="Python_Packages_Deb"/>
    * Install virtualenvwrapper in global environment:
      `sudo pip install virtualenvwrapper`
    * Create a location to contain virtualenvs:
        * `sudo mkdir -p /usr/local/virtualenvs`
    * As `jbeideploy`, add shell startup (e.g. `~/.bashrc`):

            if [ -f /usr/local/bin/virtualenvwrapper.sh ]; then
                export WORKON_HOME=/usr/local/virtualenvs
                source /usr/local/bin/virtualenvwrapper.sh
            fi

    * Run `source ~/.bashrc` to apply changes
    * Set up virtualenv for the `${SITE}` where code is checked out
        * `mkvirtualenv ${SITE}` will create the virtualenv
        * `workon ${SITE}` will load the virtualenv into current shell session
        * `pip install -r /var/www/${SITE}/requirements.txt` to install python packages to virtualenv
            * If you get a compiler error complaining about “missing sasl.h” when installing ldap,
              `sudo apt-get install libsasl2-dev` and install the requirements again.
        * Use `deactivate` to exit the virtualenv but retain your shell session.

* Set up Tomcat/Solr
    * TODO: these instructions are for version 4 of Solr, should update to Solr5
    * Install Tomcat 7:
        * `sudo apt-get install tomcat7`
        * This will automatically create a “tomcat7” user.
    * Force the server to only listen on localhost:
        * Edit ‘/etc/tomcat7/server.xml’ and change the line:
          `<Connector port="8080" protocol="HTTP/1.1"`
          to:
          `<Connector port="8080" protocol="HTTP/1.1" address="localhost"`
    * [Download solr v4][31] and unzip to /tmp/solr
    * Copy Solr main war file:
        * `cp /tmp/solr/dist/solr-4.10.4.war /var/lib/tomcat7/webapps/solr.war`
        * `sudo chown tomcat7:tomcat7 /var/lib/tomcat7/webapps/solr.war`
        * `sudo chmod 644 /var/lib/tomcat7/webapps/solr.war`
    * Copy Solr libraries to Tomcat lib and set proper permissions:
        * `sudo cp /tmp/solr/example/lib/ext/*.jar /usr/share/tomcat7/lib/`
        * `sudo cp /tmp/solr/dist/solrj-lib/*.jar /usr/share/tomcat7/lib/`
        * `sudo chmod a+rx /usr/share/tomcat7/lib/*.jar`
        * `sudo cp /tmp/solr/example/resources/log4j.properties /etc/tomcat7/log4j.properties`
        * `sudo chgrp tomcat7 /etc/tomcat7/log4j.properties`
    * Create a home folder for Solr:
        `sudo mkdir -p /var/solr/data`
    * Copy in edd-django solr config files:
        `sudo cp -R /var/www/${SITE}/solr/* /var/solr/``
        `sudo chown -R tomcat7:tomcat7 /var/solr`
    * Set up the Solr config file:
        * `sudo pico /etc/tomcat7/Catalina/localhost/solr.xml` and enter the following:

                <Context docBase="/var/lib/tomcat7/webapps/solr.war" debug="0" crossContext="true">
                    <Environment name="solr/home" type="java.lang.String" value="/var/lib/tomcat7/solr" override="true" />
                </Context>

    * Start Tomcat/Solr:
        * `sudo /etc/init.d/tomcat7 start`
    * Optional:
        * Install the tomcat admin page with `sudo apt-get install tomcat7-admin`
        * Add a user capable of accessing the admin page by editing `/etc/tomcat7/tomcat-users.xml`.
          Instructions are in the file.
        * Diagnose startup issues by inspecting `/var/log/tomcat7/catalina.out`

* Django setup <a name="Django_Deb"/>
    * See section Database Conversion below if migrating from CGI EDD database
    * `./manage.py collectstatic` to ensure that all static files are in one spot
    * `./manage.py edd_index` to populate search indices

* Apache setup <a name="Apache_Deb"/>
    * mod_wsgi: `sudo apt-get install libapache2-mod-wsgi`
    * Make sure the apache modules are enabled, with `a2enmod ssl`, and `a2enmod wsgi`
    * See `apache.conf-sample` for example of how to configure Apache
    * Ensure that `/var/www/uploads/` exists and is writable by user `www-data`

* TODO complete Debian instructions

### Deploying code changes (debian)

* `sudo su username_tbd`
* `git branch`
* `git pull`
* `git checkout`
* `manage.py migrate`
* `service apache2 restart`
* `service edd_celeryd restart`
 
---------------------------------------------------------------------------------------------------

## Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in local_settings.py INSTALLED_APPS


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


## Solr Tests <a name="Solr_Test"/>

* Tests in this project make use of a `test` core, which will need to be created
    * Create a new data directory `mkdir -p /usr/local/var/solr/data/test`
    * Add new line to `solr.xml` using same studies `instanceDir` and new data directory
        `<core name="tests" instanceDir="./cores/studies" dataDir="/usr/local/var/solr/data/test"/>`


## Required Python Package Reference <a name="PythonPackages"/>
This section describes required Python packages for EDD. This listing is for reference only,
since EDD's requirements.txt should normally be used to install required packages.

* On JBEI Debian servers, home directories are NFS-mounted, and `pip` can be slow, especially
  with `scikit-learn` and `scipy`
    * run `pip install` with `-b /path/to/local/disk` to use a non-NFS directory
* N.B. probably need to re-install `cryptography` to compile in correct OpenSSL (on OS X)
* [Arrow][10]
      * "Arrow is a Python library that offers a sensible, human-friendly approach to creating,
        manipulating, formatting and converting dates, times, and timestamps."
      * `pip install arrow`
* [cryptography][11]
    * Adds some crypto libraries to help play nice with TLS certificates
    * Needs additional env flags to ensure using Brew-installed OpenSSL
    * `env ARCHFLAGS="-arch x86_64" LDFLAGS="-L/usr/local/opt/openssl/lib"
        CFLAGS="-I/usr/local/opt/openssl/include" pip install cryptography`
        * May need to include `--upgrade --force-reinstall` flags after `install` in prior
          command
* [Django][12]
    * MVC web framework used to develop EDD.
    * `pip install Django`
* [django-allauth][25]
    * A Django application providing for both local and social logins
    * `pip install django-allauth`
* [django-auth-ldap][13]
    * A Django application providing authentication with an LDAP backend.
    * `pip install django-auth-ldap`
* [django-extensions][14]
    * Adds additional management extensions to the Django management script.
    * `pip install django-extensions`
* [django-threadlocals][15]
    * A Django middleware for storing the current request in a thread.local
* [requests][16]
    * "Requests is an Apache2 Licensed HTTP library, written in Python, for human beings."
    * `pip install requests[security]`
* [psycopg2][17]
    * Database driver/adapter for PostgreSQL in Python.
    * `pip install psycopg2`
* [python-ldap][18]
    * Object-oriented client API for accessing LDAP directories.
    * `pip install python-ldap`


## Setting up multiple Apache VHOST <a name="Apache_VHOST"/>
* Clone code into a new directory
    * Create `server.cfg` and `edd/local_settings.py` based on example files
* Create a new virtualenv for the virtual host
    * fast way is copy another virtualenv with `virtualenv-clone /path/to/old /path/to/new`
    * easiest and/or more repeatable to `pip install -r requirements.txt` in new virtualenv
        * remember there is a separate requriements.txt for Celery dependencies
* Clone a new database
    * depending on code version of 'donor' database and target code version, `./manage.py migrate`
    * TODO: SYNBIO-1245, should be able to bootstrap from empty database
* In the VirtualHost directive:
    * Set the hostname to the correct host
    * Update the WSGI Process Group
    * Update the python-path for the WSGI process to reference new directory and virtualenv
    * Set the logging for error.log and access.log to vhost-specific files
* TODO: punting on handling multiple solr indexes


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
