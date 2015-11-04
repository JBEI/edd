# Experiment Data Depot

The Experiment Data Depot (EDD) is a web-based repository of processed data obtained via
experimentation.  See the deployed version at [edd.jbei.org][1].
    
## Contents
* System Pre-requisites
   * [Passwords](#Passwords)
   * Mac OSX
       * [XCode](#XCode)
       * [HomeBrew](#HomeBrew)
       * [Python](#Python)
       * [OpenSSL](#OpenSSL)
       * [Pip](#Pip)
       * [virtualenvwrapper](#VirtualEnvWrapper)
       * [PostgreSQL](#PostgreSQL)
       * [Solr/Tomcat](#Solr_Tomcat) (Solr 4.X)
       * [Solr Standalone](#Solr) (Solr 5.X)
       * [Python Packages](#Python_Packages)
       * [Update EDD Configuration Files](#EDD_Config)
       * [Configure LDAP SSL](#LDAP_SSL)
       * [Build Tools](#Build_Tools)
       * [Configure Database](#Configure_DB)
       * [Start EDD](#Start_EDD)
       * [Build Solr Indices](#Build_Indices)
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
* [Database Conversion](#Db_Conversion)
* [Solr Tests](#Solr_Test)
* [Required Python Package Reference](#PythonPackages)

---------------------------------------------------------------------------------------------------

## System Pre-requisites

 * Passwords <a name="Passwords"/>
    * Get required passwords from a teammate or JBEI sysadmin.
        * JBEI_AUTH - to configure LDAP binding and EDD's server.cfg
        * edduser - the password to the production EDD database instance. You'll need this to copy
          its data for local development work. See [Database Conversion](#DbConversion)
        * edd ice key - used by edd to authorize REST API calls to ICE
   
### Mac OS X
This section contains directions for setting up a development environment on EDD in OSX.

* XCode <a name="XCode"/>
    Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
    * Establish `/usr/include` with:
      ``sudo ln -s `xcrun --show-sdk-path`/usr/include /usr/include``
* [Homebrew][2] <a name="HomeBrew"/>
    * `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
    * `brew doctor`
* Python <a name="Python"/>
    * Replace default OS X version of Python with the more up-to-date Homebrew version
    * `brew install python`
    * May need to reload shell to see the proper Python version
* Replace default OS X version of OpenSSL <a name="OpenSSL"/>
    * `brew install OpenSSL`
* [Pip][3] <a name="Pip"/>
    * Should be installed as part of Homebrew install of Python
    * For latest version: `sudo pip install --upgrade --no-use-wheel pip`
    * Also a good idea to: `sudo pip install --upgrade setuptools`
    * Manually install by downloading get-pip.py, run `sudo python get-pip.py`
* [virtualenvwrapper][4] <a name="VirtualEnvWrapper"/>
    * Makes dependency tracking, development, and deployment easier
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            export WORKON_HOME=$HOME/.virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh

    * Make a new virtualenv, e.g. `mkvirtualenv edd.jbei.org`
        * `deactivate` to return to regular global python environment
        * `workon edd.jbei.org` to switch back to edd python environment
        * run under `workon edd.jbei.org` for the remainder of the pip installs in this document. This
          will isolate your EDD Python configuration from any other changes you make to your
          system.
* PostgreSQL <a name="PostgreSQL"/>
    * required for installing psycopg2 driver, do not need to run database locally
    * `brew install postgresql`
    * Following PostgreSQL steps are optional if using external database server
    * Instructions on startup can be found with `brew info postgresql`
        * Manually start with `postgres -D /usr/local/var/postgres`
    * Enable the hstore extension on all new databases:
        * `psql -d template1 -c 'create extension hstore;'`
    * `createdb edddjango`
    * `createuser postgres`
    * `psql edddjango` and
            CREATE USER edduser WITH PASSWORD 'somegoodpassword'
                NOSUPERUSER INHERIT CREATEDB NOCREATEROLE NOREPLICATION;
    * ctrl-d to exit

* Solr / Tomcat <a name="Solr_Tomcat"/>
    * For older 4.X Solr. Skip this item for Solr 5.0+
    * At present, this is the recommended version until EDD and these directions are updated for
      Solr 5.0+
    * Install a JDK8+ from [Oracle][5]
    * `brew install tomcat`
    * `brew install homebrew/versions/solr4`
    * Link to easily access tomcat and solr install directories:
        * `ln -s /usr/local/Cellar/tomcat/(VERSION)/libexec/ /usr/local/tomcat`
        * `ln -s /usr/local/Cellar/solr4/(VERSION)/ /usr/local/solr`
    * Copy Solr libraries to Tomcat lib:
        * `cp /usr/local/solr/example/lib/ext/* /usr/local/tomcat/lib/`
    * Create Solr directories: `mkdir -p /usr/local/var/solr/data`.
        * Note that `data/` must exist for Solr to work, but files are purposefully copied to its
          parent, `/usr/local/var/solr/` in subsequent steps.
    * Copy Solr configuration from `edd-django/solr` to `/usr/local/var/solr/`
    * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhost
        * find `<Connector port="8080" ...`
        * add attribute `address="localhost"`
    * Modify `/usr/local/tomcat/conf/Catalina/localhost/ROOT.xml` to point docbase to the Solr WAR
      at `/usr/local/solr/example/webapps/solr.war`
    * Add a `setenv.sh` to `/usr/local/tomcat/bin/` and `chmod +x /usr/local/tomcat/bin/setenv.sh`
    
            #!/bin/bash
            JAVA_OPTS="$JAVA_OPTS -Dsolr.solr.home=/usr/local/var/solr"

    * Service is controlled with `catalina` command; `catalina start` and `catalina stop`
    * Access admin interface via <http://localhost:8080/>

* Solr <a name="Solr"/>
    * For versions 5.0+. Optional if using non-local server for Solr
    * Starting with 5.0, Solr no longer supports deployment to a separate application server.
      It's designed to run as a separate server.
    * Install a JDK8+ from [Oracle][5]
    * `brew install solr`
    * Link to easily access solr install directory:
        * `ln -s /usr/local/Cellar/solr/(VERSION)/ /usr/local/solr`
       
    * TODO: re-examine Solr directions from this point forward, with EDD in mind.
    * Need to distill guidance in the following resources, also updating EDD's solr files:
        * [Installing][6]
        * [Upgrading][7]
        * [Solr.xml format changes][8]
        * [Core Admin][9] -- referenced from sample solr.xml -- see newer format required in 5.0
    * Create Solr data directories: TODO: still necessary?
      `mkdir -p /usr/local/var/solr/data`
    * Copy Solr configuration from `edd-django/solr` to solr data directory
      `usr/local/Cellar/solr/(VERSION)/server/solr`
    * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhost
        * find `<Connector port="8080" ...`
        * add attribute `address="localhost"`
    * Service is controlled with `solr` command; `solr start` and `solr stop -all`
    * Access admin interface via <http://localhost:8983/>

* Install python packages
    
            cd code/edd-django
            sudo pip install -r requirements.txt

    * See [Python Packages](#PythonPackages) for a detailed list

 * Update EDD Configuration Files <a name="EDD_Config"/>
    * Use EDD's `server.cfg-example` as a template to create a `server.cfg` file, replacing values
      for:
        * `site.secret`
        * `db.pass`: the password you created for your local edduser Postgres account
        * `ldap.pass`: the JBEI_AUTH password
        * `ice.edd_key`: the key used by EDD send REST API calls to ICE
        * `site.admins`: use your email address to receive Celery failure messages as a debugging
            aid, but limit spam to other team members during development
        * `email.host`: aspmx.l.google.com will work if you have a GMail account
        * TODO: using localhost as email host should work fine within LBL domain
    * Update `site`, `db`, `solr`, `ldap`, and `ice` for appropriate connection parameters
    * _*DO NOT CHECK THIS FILE INTO SOURCE CONTROL*_ ! This file is included by default in EDD's
      `.gitignore` file, so you should have to work hard to commit it to Git by mistake.

* Configure LDAP SSL <a name="LDAP_SSL"/>
    * Configue handling in `/etc/openldap/ldap.conf`
    * TODO: this section may no longer apply, identity.lbl.gov has signed certificate now
    * For OS X 10.9.x "Mavericks" or 10.10.x "Yosemite"
        * `sudo su -`
        * Pull CA certificates from `identity.lbl.gov`
            * As root in `/System/Library/OpenSSL/certs`
                * `openssl s_client -showcerts -connect identity.lbl.gov:636 > godaddy.crt`
                    * The command will hang, but still generates the data. CTRL-C to stop it.
                * Edit `godaddy.crt` to remove all non-certificate blocks (outside BEGIN/END), and
                  the first certificate block (the identity.lbl.gov certificate). When you are
                  finished, the only file content should be the "BEGIN/END" lines and the
                  certificates themselves. No blank lines!
        * Edit as root `/etc/openldap/ldap.conf`
            * Add line `TLS_CACERTDIR   /System/Library/OpenSSL/certs`
            * Add line `TLS_CACERT      /System/Library/OpenSSL/certs/godaddy.crt`
        * Test with:

                ldapsearch -H ldaps://identity.lbl.gov -b "ou=People,dc=lbl,dc=gov" -W \
                    -D "uid=jbei_auth,cn=operational,cn=other" -s base "objectclass=*"

        * Output should contain `result: 0 Success`

    * For problems in OS X 10.10.x "Yosemite":
        * Problems occurred for some developers in certificate checking with ldapsearch
        * Work-around, comment out the `TLS_REQCERT` line

* Install and run [Build Tools](#BuildTools) <a name="Build_Tools"/>

* Configure Database <a name="Configure_DB"/>
    * See [Database Conversion](#DbConversion) below for instructions that also apply to initial
      database creation

* Start EDD <a name="Start_EDD"/>
    * If not already running, start supporting services
        * Solr
            * 4.X: `catalina start` to start Tomcat and Solr
            * 5+: `solr start` to start standalone Solr server
    * `./manage.py runserver` will launch EDD at <http://localhost:8000/>
    * `./manage.py test main` will run unit tests on the main application
        * Solr tests make use of a different core, see Solr section below.

* Build Solr Indices <a name="Build_Indices"/>
    * `./manage.py edd_index`

---------------------------------------------------------------------------------------------------

### Debian (for deployment) <a name="Debian"/><a name="Debian_Packages"/>

* Required `.deb` packages
    * `sudo apt-get install python-pip` for PyPI/pip python package manager
    * `sudo apt-get install postgresql-client` for commands used to copy database
    * `sudo apt-get install libpq-dev` for headers required by psycopg2
    * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers required by
      python-ldap
    * `sudo apt-get install python-dev libffi-dev` for headers required by cryptography
    * `sudo apt-get install libatlas-dev liblapack-dev gfortran` for packages required by SciPy
    * `sudo apt-get install libbz2-dev` for packages required by libsmbl

* Configure LDAP SSL handling in `/etc/ldap/ldap.conf` <a name="Configure_LDAP"/>
    * Add line `TLS_CACERTDIR   /etc/ssl/certs`
    * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`

* Check out code to `/var/www/${SITE}` <a name="Check_Out"/>

* PostgreSQL <a name="PostgreSQL"/>
    * Required for installing psycopg2 driver, even if you don’t need to run database locally
        * If you want a more recent postgresql, you can use the Postgresql 3rd-party repository with apt-get:
        * `wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -`
        * `sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ trusty-pgdg main" >> /etc/apt/sources.list.d/postgresql.list’`
        * `sudo apt-get update`
        * `sudo apt-get install postgresql`
    * `sudo apt-get install postgresql-contrib` (for hstore extension)
    * Postgres user should already exist.  Let’s su to that user for the rest of these postgres commands:
        * `sudo su postgres`
    * `psql -d template1 -c 'create extension hstore;’` (to enable hstore)
    * `createdb edddjango`
    * `createuser postgres`
    * `psql edddjango` and
            CREATE USER edduser WITH PASSWORD 'somegoodpassword'
                NOSUPERUSER INHERIT CREATEDB NOCREATEROLE NOREPLICATION;
    * ctrl-d to exit
    * `exit` to stop being postgres

* [Pip][3] <a name="Pip"/>
    * Should be installed as part of standard Python (note: setuptools may not be up-to-date)
	    * For latest version: `sudo pip install --upgrade --no-use-wheel pip`
    * A good idea to: `sudo pip install --upgrade setuptools`

* Python packages <a name="Python_Packages_Deb"/>
    * `sudo pip install virtualenvwrapper`
    * `mkdir -p /usr/local/virtualenvs`
        * TODO: should look into permissions on directory containing virtualenvs
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            if [ -f /usr/local/bin/virtualenvwrapper.sh ]; then
                export WORKON_HOME=/usr/local/virtualenvs
                source /usr/local/bin/virtualenvwrapper.sh
            fi

    * Test your work by launching a new Terminal and running `echo $WORKON_HOME`
        * If no value is printed, consider adding a ``~/.bash_profile`` file to force your
          `.bashrc` to be executed. See [explanation][24]

            [[ -r ~/.bashrc ]] && . ~/.bashrc

    * `mkvirtualenv edd.jbei.org`
    * `workon edd.jbei.org`
    * `pip install -r /path/to/project/requirements.txt` to install python packages to virtualenv
        * If you get a compiler error complaining about “missing sasl.h” when installing ldap,
        * `sudo apt-get install libsasl2-dev` and install the requirements again.
    * Use `deactivate` to exit the virtual environment but retain your shell session.

* Set up Tomcat/Solr (these instructions are for version 4 of Solr)
    * Install Tomcat 7:
	* `sudo apt-get install tomcat7`
	* This will automatically create a “tomcat7” user.
    * Force the server to only listen on localhost:
	* Edit ‘/etc/tomcat7/server.xml’ and change the line:
	    <Connector port="8080" protocol="HTTP/1.1"
		to:
	    <Connector port="8080" protocol="HTTP/1.1" address="localhost"
    * Download solr v4 and unzip to [solr download]
	* http://archive.apache.org/dist/lucene/solr/4.10.4/
    * Copy Solr main war file:
	* `cp [solr download]/dist/solr-4.10.4.war /var/lib/tomcat7/webapps/solr.war`
	* `sudo chown tomcat7:tomcat7 /var/lib/tomcat7/webapps/solr.war`
	* `sudo chmod 644 /var/lib/tomcat7/webapps/solr.war`
    * Copy Solr libraries to Tomcat lib and set proper permissions:
	* `sudo cp [solr download]/example/lib/ext/*.jar /usr/share/tomcat7/lib/`
	* `sudo cp [solr download]/dist/solrj-lib/*.jar /usr/share/tomcat7/lib/`
	* `sudo chmod a+rx /usr/share/tomcat7/lib/*.jar`
	* `sudo cp [solr download]/example/resources/log4j.properties /etc/tomcat7/log4j.properties`
	* `sudo chgrp tomcat7 /etc/tomcat7/log4j.properties`
    * Create a home folder for Solr within tomcat7:
	`sudo mkdir /var/lib/tomcat7/solr`
	`sudo mkdir /var/lib/tomcat7/solr/data`
    * Copy in edd-django solr config files:
	`sudo cp -R [edd download]/solr/* /var/lib/tomcat7/solr/``
	`sudo chown -R tomcat7:tomcat7 /var/lib/tomcat7/solr`
    * Set up the Solr config file:
	* `sudo pico /etc/tomcat7/Catalina/localhost/solr.xml` and enter the following:
	<Context docBase="/var/lib/tomcat7/webapps/solr.war" debug="0" crossContext="true">
	  <Environment name="solr/home" type="java.lang.String" value="/var/lib/tomcat7/solr" override="true" />
	</Context>
    * Start Tomcat/Solr:
	* `sudo /etc/init.d/tomcat7 start`
    * Optional:
	* Install the tomcat admin page with `sudo apt-get install tomcat7-admin`
	* Add a user capable of accessing the admin page by editing `/etc/tomcat7/tomcat-users.xml`.  Instructions are in the file.
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
 
---------------------------------------------------------------------------------------------------

## Helpful Python Packages <a name="Helpful_Python"/>

* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in local_settings.py INSTALLED_APPS

## Build Tools <a name="BuildTools"/>

* The EDD makes use of Node.js and grunt for builds; it would be a good idea to:
    * OS X:
        * `brew install node`
        * `sudo npm install -g grunt-cli`
        * `sudo npm install grunt`
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
    * dependencies are already loaded into the git repo
    * `sudo npm install grunt-typescript`

* Compile changes in `*.ts` to `*.js` by simply running `grunt` from the edd base directory

## Controlling EDD's Dependencies <a name="ControllingDependencies"/>
EDD has a number of dependencies, all of which may need to be monitored/managed during development,
testing, and production. This document contains directions for daemonizing most of them, so
developer interaction with can often be minimal.  As needed, use the following basic commands and
URL's to interact with them.

* PostgreSQL: installed as a daemon by default on all OS's. You probably won't need to mess
  with it.
    * Stop/start with `/etc/init.d/postgresql stop` and `/etc/init.d/postgresql start`
    * Configuration file for port etc is at /etc/postgresql/9.x/main/postgresql.conf .
* Solr
    * Solr 4.X / Tomcat
        * Sample monitoring interface URL: <http://localhost:8080/>
        * `catalina start` / `catalina stop`
    * Solr 5.+:
        * Sample monitoring interface URL: <http://localhost:8983/>
        * `solr start` / `solr stop`
* RabbitMQ
    * Sample monitoring interface URL: <http//localhost:15672/>
    * Development (OSX) 
        * Manual operation (as user rabbitmq)
            * `rabbitmq-server start -detached`. Leave off the `-detached` option to get better
              error messages during configuration.
            * `rabbitmqctl stop/status`
        * Daemon
            * `launchctl un/load /Library/LaunchDaemons/com.rabbitmq.plist`
            * `launchctl list com.rabbitmq`
        * Config files are in `/etc/rabbitmq/` and `/usr/local/etc/rabbitmq/rabbitmq-env.conf`
        * Logs are in `/usr/local/var/log/rabbitmq/`
    * Production / Test (Debian)
        * `sudo service rabbitmq-server start/stop/status` or
          `sudo invoke-rc.d rabbitmq-server start/stop/status`
        * Log files are in `/var/log/rabbitmq/`
        * Config file is in `/etc/rabbitmq/rabbitmq.config`
    * Other useful management commands are in the [docs][20]
* Celery / Flower
    * Sample Flower URL: <http://localhost:5555/>
    * Celery Worker: must run in base edd directory to detect celery config modules
        * Development: 
            * Pre-demonazition: `celery worker --app edd --queues=edd --hostname=edd-worker-1.%h
              --autoscale=10,1 --autoreload --loglevel=info`
            * Post-demonization:  `sudo launchctl list | grep celery`, `sudo launchctl (un)load
              /Library/LaunchDaemons/org.celeryq.worker.plist`
        * Production / Test: `celery worker --app edd --queues=edd --hostname=edd-worker-1.%h
          --autoscale=10,1`
            * `service edd_celeryd {start|stop|force-reload|restart|try-restart|status}`
            * Note that in production, prefork() processes will have the same memory and file
              access as the user that launches this process
            * Worker daemon config file: `/etc/default/edd_celeryd`
    * Flower  - Development / Production / Test
        * TODO: experiment further with getting password out of the command
        * `celery flower -A edd.flowerconfig.flower_mgmt_interface
          --basic_auth=flower:FLOWER_WEB_INTERFACE_PASSWORD_DEFINED_HERE`
            * replacing the password with the desired one
            * `-basic_auth` can likely be left out for development
        * Though little documentation exists, it appears that the `--persistent=True` flag is
          required to make Flower display the same task list following a restart of Flower only
          (not Celery or RabbitMQ). It appears best for Flower 0.9 to omit this flag and treat
          Flower as a real-time monitoring tool only.
        * For installations on an unsafe network, consider alternate [authentication][21] flags
          for Flower
        * Note that the `-conf` option doesn't seem to work according to the sample in the
          instructions, or via attempted variations on that [example][22]

## Database Conversion <a name="DbConversion"/>

This section provides instructions for converting the EDD database to handle a new schema, or on
populating a new deployment with existing data.

* Run edd's `reset_db.sh` to execute all of the steps below.
* Create a SQL dump file to capture the contents of the existing EDD database
 
        pg_dump -i -h postgres.jbei.org -U edduser -F p -b -v -f edddb.sql edddb

* Enter remote `edduser` password (NOT the one you created for your local instance)
 
* Create a database for the django application
    * `psql -c 'create database edddjango;'` to create the database
    * `psql -d edddjango -c 'create schema old_edd;'` to make a schema for migrating data
    * `psql -d edddjango -c 'grant all on schema old_edd to edduser;'`
* Edit the SQL file to prepend the new schema to the `SET search_path` line, and replace all
  instances of `public.` with `old_edd.` (or whatever schema name you created above):
    
        cat edddb.sql | sed 's#SET search_path = #SET search_path = old_edd, #g' | \
        sed 's#public\.#old_edd\.#g' | sed 's#Schema: public;#Schema: old_edd;#g' > edddb_upd.sql

* Copy the dump file content into the database with `psql edddjango < edddb_upd.sql`
* Initialize the django schema
    * Run `./manage.py migrate` to create schema for django
    * Fill in data with `psql edddjango < convert.sql`
* Set user permissions
    * If this is a development database, manually edit the auth_user table to set `is_superuser`
      and `is_staff` to true for your account.
    * `psql edddjango -c "update auth_user set is_superuser=true, is_staff=true where username =
      'YOUR_USERNAME'"`

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
      * `sudo pip install arrow`
* [cryptography][11]
    * Adds some crypto libraries to help play nice with TLS certificates
    * Needs additional env flags to ensure using Brew-installed OpenSSL
    * `env ARCHFLAGS="-arch x86_64" LDFLAGS="-L/usr/local/opt/openssl/lib"
        CFLAGS="-I/usr/local/opt/openssl/include" pip install cryptography`
        * May need to include `--upgrade --force-reinstall` flags after `install` in prior
          command
* [Django][12]
    * MVC web framework used to develop EDD.
    * `sudo pip install Django`
* [django-auth-ldap][13]
    * A Django application providing authentication with an LDAP backend.
    * `sudo pip install django-auth-ldap`
* [django-extensions][14]
    * Adds additional management extensions to the Django management script.
    * `sudo pip install django-extensions`
* [django-threadlocals][15]
    * A Django middleware for storing the current request in a thread.local
* [requests][16]
    * "Requests is an Apache2 Licensed HTTP library, written in Python, for human beings."
    * `sudo pip install requests[security]`
* [psycopg2][17]
    * Database driver/adapter for PostgreSQL in Python.
    * `sudo pip install psycopg2`
* [python-ldap][18]
    * Object-oriented client API for accessing LDAP directories.
    * `sudo pip install python-ldap`

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
