# Experiment Data Depot

The Experiment Data Depot (EDD) is a web-based repository of processed data obtained via
    experimentation.  See the deployed version at [edd.jbei.org](https://edd.jbei.org).
    
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
        * [Solr/Tomcat ](#Solr_Tomcat) (Solr 4.X)
        * [Solr Standalone ](#Solr) (Solr 5.X)
        * [Python Packages](#Python_Packages)
        * [Update EDD Configuration Files](#EDD_Config)
        * [Configure LDAP SSL](#LDAP_SSL)
        * [Build Tools](#Build_Tools)
        * [Configure Database](#Configure_o)
        * [Install & Configure RabbitMQ backend](#Install_Config_RabbitMQ)
        * [Install Celery as a daemon](#InstallCeleryDaemon)
        * [Install Flower as a daemon](#InstallFlowerDaemon)
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
        * [Install & Configure RabbitMQ backend](#Install_Config_RabbitMQ_Deb)
        * [Install Requirements for Celery & Flower](#Install_Celery_Reqs_Deb)
        * [Configure Flower](#Configure_Flower_Deb)
        * [Test Celery & Flower from the command line](#Test_Celery_And_Flower_Deb)
        * [Configure Celery Worker(s) To Run as Daemon](#Configure_Celery_Daemon)
* [Helpful Python Packages](#Helpful_Python)
* [Build Tools](#BuildTools)
* [Controlling EDD's Dependencies](#ControllingDependencies)
* [Database Conversion](#Db_Conversion)
* [Configure RabbitMQ for Celery and EDD](#ConfigureRabbitMQ)
* [Solr Tests](#Solr_Test)
* [Required Python Package Reference](#PythonPackages)

---------------------------------------------------------------------------------------------------

## System Pre-requisites
 * Passwords <a name="Passwords"/>
    Get required passwords from a teammate or JBEI sysadmin.
    * JBEI_AUTH - to configure LDAP binding and EDD's server.cfg
    * edduser - the password to the production EDD database instance. You'll need this to copy its
      data for local development work. See [Database Conversion](#DbConversion)
    * edd ice key - used by edd to authorize REST API calls to ICE
   
### Mac OS X
This section contains directions for setting up a development environment on EDD in OSX.

 * XCode <a name ="XCode"/> 
    Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
    * Establish `/usr/include` with:
        ``sudo ln -s `xcrun --show-sdk-path`/usr/include /usr/include``
 * [Homebrew](http://brew.sh) <a name ="HomeBrew"/> 
    * `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
    * `brew doctor`
 * Python <a name="Python"/>
    * Replace default OS X version of Python with the more up-to-date Homebrew version
    * `brew install python`
    * May need to reload shell to see the proper Python version
 * Replace default OS X version of OpenSSL <a name="OpenSSL"/>
    * `brew install OpenSSL`
 * [Pip](https://pip.pypa.io) <a name="Pip"/>
    * Should be installed as part of Homebrew install of Python
    * For latest version: `sudo pip install --upgrade --no-use-wheel pip`
    * Also a good idea to: `sudo pip install --upgrade setuptools`
    * Manually install by downloading get-pip.py, run `sudo python get-pip.py`
 * [virtualenvwrapper](http://virtualenvwrapper.readthedocs.org/en/latest/install.html)
    <a name="VirtualEnvWrapper"/>
    * Makes dependency tracking, development, and deployment easier
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

        export WORKON_HOME=$HOME/.virtualenvs
        source /usr/local/bin/virtualenvwrapper.sh

    * Make a new virtualenv, e.g. `mkvirtualenv edd`
        * `deactivate` to return to regular global python environment
        * `workon edd` to switch back to edd python environment
        * run under `workon edd` for the remainder of the pip installs in this document. This will
          isolate your EDD Python configuration from any other changes you make to your system.
 * PostgreSQL (required for installing psycopg2 driver later) <a name="PostgreSQL"/>
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

 * Solr / Tomcat ( For older 4.X Solr. Skip this item for Solr 5.0+) <a name="Solr_Tomcat"/>
    * At present, this is the recommended version until EDD and these directions are updated for
      Solr 5.0+
    * Install a JDK8+ from [Oracle](http://java.oracle.com)
    * `brew install tomcat`
    * `brew install homebrew/versions/solr4`
    * Link to easily access tomcat and solr install directories:
        * `ln -s /usr/local/Cellar/tomcat/(VERSION)/libexec/ /usr/local/tomcat`
        * `ln -s /usr/local/Cellar/ solr4/(VERSION)/ /usr/local/solr`
    * Copy Solr libraries to Tomcat lib:
       * For solr 4.x: `cp /usr/local/solr/example/lib/ext/* /usr/local/tomcat/lib/`
       * For solr 5.x:
            * Copy Solr libraries to Tomcat lib. Complete directions for this version may not be
              known.
            * `cp /usr/local/solr/server/lib/ext/* /usr/local/tomcat/lib/`
    * Create Solr directories:
        * `mkdir -p /usr/local/var/solr/data`.
        * Note that `data/` must exist for Solr to work, but files are purposefully copied to its
          parent, `/usr/local/var/solr/` in subsequent steps.
    * Copy Solr configuration from `edd-django/solr` to `/usr/local/var/solr/`
    * `cp /usr/local/solr/server/webapps/solr.war /usr/local/tomcat/webapps/solr.war`
    * Add a `setenv.sh` to `/usr/local/tomcat/bin/` and `chmod +x /usr/local/tomcat/bin/setenv.sh`
    
        #!/bin/bash
        JAVA_OPTS="$JAVA_OPTS -Dsolr.solr.home=/usr/local/var/solr"

    * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhost
        * find `<Connector port="8080" ...`
        * add attribute `address="localhost"`
    * Service is controlled with `catalina` command; `catalina start` and `catalina stop`
    * Access admin interface via <http://localhost:8080/solr>
 
 * Solr (For versions 5.0+. Optional if using non-local server for Solr) <a name= "Solr"/>
    * Starting with 5.0, Solr no longer supports deployment to a separate application server. It's
      designed to run as a separate server.
    * Install a JDK8+ from [Oracle](http://java.oracle.com)
    * `brew install solr`
    * Link to easily access solr install directory:
        * `ln -s /usr/local/Cellar/solr/(VERSION)/ /usr/local/solr`
       
    * TODO: re-examine Solr directions from this point forward, with EDD in mind.
        * Need to distill guidance in thefollowing resources, also updating EDD's solr files:
            * [Installing](https://cwiki.apache.org/confluence/display/solr/Installing+Solr)
            * [Upgrading](https://cwiki.apache.org/confluence/display/solr/Upgrading+a+Solr+4.x+Cluster+to+Solr+5.0#UpgradingaSolr4.xClustertoSolr5.0-Step2:InstallSolr5asaService)
            * [Solr.xml format changes](http://wiki.apache.org/solr/Solr.xml%204.4%20and%20beyond)
            * [Core Admin](http://wiki.apache.org/solr/CoreAdmin) -- referenced from sample
              solr.xml -- see newer format required in 5.0
    * Create Solr data directories: TODO: still necessary?
      `mkdir -p /usr/local/var/solr/data`
    * Copy Solr configuration from `edd-django/solr` to solr data directory
      `usr/local/Cellar/solr/(VERSION)/server/solr`
    * TODO: lock down server to only accept localhost requests?
    * Service is controlled with `solr` command; `solr start` and `solr stop -all`
    * Access admin interface via <http://localhost:8983/solr/#/>
 
 * Install python packages <a name="Python_Packages"/>
    
        cd code/edd-django
        sudo pip install -r requirements.txt

    * See [Python Packages](#PythonPackages) for a detailed list
    * Add the workaround specified in [django-threadlocals](#django-threadlocals) to make this
      package Python 2 compliant
 
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
    * For OS X 10.9.x "Mavericks" or 10.10.x "Yosemite"
        * `sudo su -`
        * Pull CA certificates from `identity.lbl.gov`
            * As root in `/System/Library/OpenSSL/certs`
                * `openssl s_client -showcerts -connect identity.lbl.gov:636 > godaddy.crt`
                    * The command will hang, but still generates the data. CTRL-C to stop it.
                * Edit `godaddy.crt` to remove all non-certificate blocks (outside BEGIN/END), and
                  the first certificate block (the identity.lbl.gov certificate). When you're
                  finished, the only file content should be the "BEGIN/END" lines and the
                  certificates themselves. No blank lines!
        * Edit as root `/etc/openldap/ldap.conf`
            * Add line `TLS_CACERTDIR   /System/Library/OpenSSL/certs`
            * Add line `TLS_CACERT      /System/Library/OpenSSL/certs/godaddy.crt`
        * Test with:
        
                ldapsearch -H ldaps://identity.lbl.gov -b "ou=People,dc=lbl,dc=gov" -W -D "uid=jbei_auth,cn=operational,cn=other" -s base "objectclass=*"

        * Output should contain `result: 0 Success`

    * For problems in OS X 10.10.x "Yosemite":
        * Problems occurred for some developers in certificate checking with ldapsearch
        * Work-around, comment out the `TLS_REQCERT` line
 
 * Install and run [Build Tools](#BuildTools) <a name="Build_Tools"/>
 
 * Configure Database <a name="Configure_DB"/>
    * See [Database Conversion](#DbConversion) below for instructions that also apply to initial
      database creation
    
 * Install & Configure RabbitMQ backend <a name="Install_Config_RabbitMQ"></a>
    * Install RabbitMQ.
        * `brew install rabbitmq`
        * Note that homebrew's directions for installing rabbitmq as a daemon don't seem to work.
          We'll configure that later.
    * For an existing EDD install without Celery, do a `pip install -r requirements.txt` to add
      Celery packages to the virtualenv
    * Configure environment
        * Update .bashrc or .bash_profile to add rabbitmq to the path for testing:
          `export PATH=$PATH:/usr/local/sbin:.`
    * In a separate terminal, start RabbitMQ in the foreground to test
        * `sudo rabbitmq-server`
    * Configure RabbitMQ for Celery and EDD
        * See [Configuration](#ConfigureRabbitMQ)
    * Restart RabbitMQ to test configuration changes
        * `sudo rabbitmqctl stop`
        * `sudo rabbitmq-server` (leave off `-detached` at first to see error messages easily)
        * Launch Celery (installed via `pip`) to make sure it can connect to RabbitMQ 
        * See directions at <a href="#ControllingDependencies">Controlling EDD's Dependencies</a>
    * Install RabbitMQ as a daemon
        * Create an unprivileged OSX user account for running RabbitMQ as a daemon. Note that the
          RabbitMQ scripts are written to only tolerate being run as as user `root` or
          `rabbitmq`, so it's important to use the exact username `rabbitmq`.
        * From the project directory:
            `cd celery/osx`
            `sudo ./add_system_user.sh rabbitmq 'RabbitMQ Message Broker'`

    * Change the user's home directory from `/var/empty/` to `/var/lib/rabbitmq`, the directory
      we've chosen to store RabbitMQ's Erlang cookie (`.erlang.cookie`)
        * `sudo dscl /Local/Default -delete Users/_rabbitmq NFSHomeDirectory`
        * `sudo dscl /Local/Default -create Users/_rabbitmq NFSHomeDirectory /var/lib/rabbitmq/`
    * Replace the user's default shell, `/usr/bin/false`, with `/bin/bash` so we can run
      `sudo rabbitmq` for testing. Other forms of login will remain disabled for this account.
        * `sudo dscl /Local/Default -delete Users/_rabbitmq UserShell`
        * `sudo dscl /Local/Default -create Users/_rabbitmq UserShell /bin/bash`
    * *After* finishing with initial command-line testing, change permissions to allow the
      `rabbitmq` user access to relevant files. Note that any subsequent use of
      `sudo rabbitmq-server` can create permissions errors for the service we're configuring.

        sudo chown -R rabbitmq /usr/local/etc/rabbitmq/
        sudo chown rabbitmq:rabbitmq /var/lib/rabbitmq/
        sudo chown rabbitmq:rabbitmq /usr/local/var/log/rabbitmq
        sudo chown -R rabbitmq:rabbitmq /usr/local/var/lib/rabbitmq
        sudo chown -R rabbitmq /usr/local/etc/rabbitmq/

    * Configure OSX to run RabbitMQ as a daemon. As long as this file exists, OSX will attempt to
      launch the daemon at startup.

        cd celery/osx
        sudo cp com.rabbitmq.plist /Library/LaunchDaemons/

    * Test that permissions for the copied script match those of other files in `LaunchDaemons/`

        `
        foundperms=$(ls -l /Library/LaunchDaemons/ | grep -v 'com.rabbitmq.plist' | awk 'NR > 1 {print $3 ":" $4 "\n" }' | sort | uniq );
        if [ $( echo $foundperms | wc -w ) = 1 ];
        then
          echo $foundperms /Library/LaunchDaemons/com.rabbitmq.plist | awk '{print "chown " $1 " " $2 }' | sh;
        else
          echo 'ERROR: mixed credential types';
        fi 
        `

        * If you get a 'mixed credential types' error, then check the permissions manually.

            ls -l /Library/LaunchDaemons/
            sudo chown <user>:<group> /Library/LaunchDaemons/com.rabbitmq.plist

    * Load the daemon and test that it's working
        * You may want to tail -f the system log in `/var/log/system.log` and/or rabbitmq logs in
          `/usr/local/var/log/rabbitmq/` in case of problems
        * `sudo launchctl load /Library/LaunchDaemons/com.rabbitmq.plist`
        * `sudo launchctl list | grep rabbit` should return a non-blank line starting with a
          non-zero integer indicating RabbitMQ's process ID
        * In case of problems, use
          `sudo launchctl unload /Library/LaunchDaemons/com.rabbitmq.plist`
        * From this point on, all manual commands should be run as user `rabbitmq`, and omitting
          the `sudo` from earlier testing.

            sudo su rabbitmq
            rabbitmqctl status

        * TODO: above should be using `sudo su - rabbitmq`?
            * Make sure `PATH` in `.bashrc` includes `/usr/local/sbin`
        * If running the command via a sudo one-liner, you'll have to set the HOME variable first,
          since RabbitMQ uses it to locate the Erlang cookie. It's probably easier to just use
          `sudo su rabbitmq`.

            export HOME=/var/lib/rabbitmq/
            sudo -u rabbitmq rabbitmqctl status

        * If `rabbitmqctl` is accidentally run as `root`, `rabbitmqctl` status will mention
          "TCP connection succeeded but Erlang distribution failed". It looks for the
          `.erlang.cookie` in the current user's home directory.
        * If a 'mkdir: /usr/local/var/lib/rabbitmq/mnesia: Permission denied' error occours when
          you run `sudo -u rabbitmq rabbitmq-server`, then one of the files/directories in that
          path has its write/execute permissions set too restrictively. To fix this, use `ls -ld`
          starting at the bottom of that path, until you find the file with restrictive
          permissions, something like this: drwx------. Then `chmod +rx` the offending file. 
 * Install Celery as a daemon <a name="InstallCeleryDaemon">
    * Create a new unplivileged OSX system account to run Celery worker(s)

        cd edd/celery/osx
        sudo ./add_system_user.sh celery

    * Replace the user's default shell, `/usr/bin/false`, with `/bin/bash` so we can run
      `sudo su celery` for testing. Other forms of login will remain disabled for this account.
        * `sudo dscl /Local/Default -delete Users/_celery UserShell`
        * `sudo dscl /Local/Default -create Users/_celery UserShell /bin/bash`
    * Give the celery user access to the EDD codebase. This can be accomplished in several ways,
      but directions below assume you'll keep the files under your home directory for
      convenience.
        * Add a user group for use in giving the celery user access to EDD code stored in your
          user account.
        * System Preferences -> Users & Groups -> Add
            * In the "New" dropdown, choose Group
            * Enter the group name, for example 'jbei_developer_daemons'
            * Check the box to add your account to the group
        * Add the celery user to the group from the command line, since system accounts aren't
          visible from the GUI

            sudo dseditgroup -o edit -a _celery -t user jbei_developer_daemons

        * Change permissions on the edd codebase. For example:

            chgrp jbei_developer_daemons /Users/shes_a_witch_/Documents/
            chgrp jbei_developer_daemons /Users/shes_a_witch/Documents/code/
            chgrp -R jbei_developer_daemons /Users/shes_a_witch/Documents/code/edd
            chmod g+rx /Users/shes_a_witch/Documents/
            chmod g+rx /Users/shes_a_witch/Documents/code/
            chmod -R g+rx /Users/shes_a_witch/Documents/code/edd

    * Alternate, easier method: add celery to group owner of home directory (`staff` on my machine)
        * `sudo dseditgroup -o edit -a celery -t user staff`
    * Verify that the celery user has read permissions on the EDD codebase

        sudo -u celery ls -l path/to/edd/

    * Run a test Celery worker from the command line and verify that it can connect to the
      RabbitMQ service

        cd edd
        celery worker --app=edd --queues=edd --hostname=edd-worker-1.%h --autoscale=10,1 --autoreload --loglevel=info

    * Create log directory for the daemon

        sudo mkdir /var/log/celery
        sudo chown celery:celery /var/log/celery

    * Load the launchctl configuration

        sudo cp edd/celery/osx/org.celeryq.worker.plist /Library/LaunchDaemons/
        sudo launchctl load /Library/LaunchDaemons/org.celeryq.worker.plist

    * Verify that the daemon started correctly. A common problem is permissions error (second
      number in output will be 78)

        sudo launchctl list | grep celery

    * See `edd/edd/celeryconfig.py` for reference
    * Test celery from the command line
 * Install Flower as a daemon<a name="InstallFlowerDaemon"></a>
    * TODO:
          
 * Start and test EDD dependencies
    * See unified directions at [Controlling EDD's Dependencies](#ControllingDependencies)
    * TODO: add directions for testing a feature that depends on Celery
 
 * Start EDD <a name="Start_EDD"/>
    * If not already running, start supporting services
    * `./manage.py runserver` will launch EDD at <http://localhost:8000/>
    * `./manage.py test main` will run unit tests on the main application
        * Solr tests make use of a different core, see Solr section below.
 
 * Build Solr Indices <a name="Build_Indices"/>
    * Manually Build Solr's indices (new deployments only)
        * `./manage.py edd_index`

---------------------------------------------------------------------------------------------------

<a name="Debian"></a>
### Debian (for deployment) <a name="Debian_Packages"/>

 * Required `.deb` packages
    * `sudo apt-get install pip` for PyPI/pip python package manager
    * `sudo apt-get install libpq-dev` for headers required by psycopg2
    * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers required by
      python-ldap
    * `sudo apt-get install python-dev libffi-dev` for headers required by cryptography
    * `sudo apt-get install libatlas-dev liblapack-dev gfortran` for packages required by SciPy
    * `sudo apt-get install libbz2-dev` for packages required by libsmbl
 
 * Configure LDAP SSL handling in `/etc/ldap/ldap.conf` <a name="Configure_LDAP"/>
    * Add line `TLS_CACERTDIR   /etc/ssl/certs`
    * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`
 
 * Check out code to `/var/www/${SITE}` <a name="Check_Out">
 
 * Python packages <a name="Python_Packages_Deb"/>
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

        export WORKON_HOME=/usr/local/virtualenvs
        source /usr/local/bin/virtualenvwrapper.sh

    * Test your work by launching a new Terminal and running `echo $WORKON_HOME`
        * If no value is printed, consider adding a ``~/.bash_profile`` file to force your
          `.bashrc` to be executed. See [explanation](http://apple.stackexchange.com/questions/119711/why-mac-os-x-dont-source-bashrc)
                
            [[ -r ~/.bashrc ]] && . ~/.bashrc

    * `mkvirtualenv edd.jbei.org`
    * `workon edd.jbei.org`
    * `pip install -r /path/to/project/requirements.txt` to install python packages to virtualenv
 
 * \(_optional_\) `sudo apt-get install tomcat7` for Tomcat/Solr <a name="Solr_Tomcat_Deb"/>
    * Download [Solr](http://lucene.apache.org/solr/) and copy WAR to webapps folder
    
 * Database : TODO
 
 * Install & Configure RabbitMQ backend <a name="Install_Cosfig_RabbitMQ_Deb>"></a>
    * References:
        * [RabbitMQ Debian Install](https://www.rabbitmq.com/install-debian.html)
        * [RabbitMQ Production Checklist]()
        * TODO: above line has no URL
    * Configure environment
        * Add the following to your `.bashrc ` or ``.bashprofile`` to simplify administation work
          for RabbitMQ

            export PATH=$PATH:/usr/sbin/:. # add admin tools & current directory to path

        * Update apt-get's sources.list to include the URL for more up-to-date RabbitMQ releases
          than those bundled with Debian (see directions at TODO)
            * Note that order matters in the sources.list file to make apt-get prioritize the newer
              releases over the Debian ones.
            * Optionally, import rabbitmq.com's public certificate to avoid warnings when updating
    * Install RabbitMQ
        * `apt-get update`
        * `sudo apt-get install rabbitmq-server=3.5.4-1`
        * Debian automatically creates a `rabbitmq` user for this service, and starts the server up
          as a daemon
   
    * Configure RabbitMQ for Celery and EDD
        * See [Configuration](#ConfigureRabbitMQ)

 * Configure Flower<a name="#Configure_Flower"></a>
    * Depending on your deployment environment, consider
      [configurating Flower authentication](http://flower.readthedocs.org/en/latest/auth.html).
      The sample worker launch commands included in this document assume the use of basic
      authentication configured in the Flower run command.
          
 * Test Celery & Flower from the command line (see
    [Controlling EDD's Dependencies](#ControllingDependencies))
    <a name="Test_Celery_And_Flower_Deb"></a>
    * Restart RabbitMQ if stopped
    * Run celery from the command line to test 
        * For Celery 3.1, the final message should end with'celery@yourhostname ready.'
    * Run Flower from the commend line to test
    * Access flower from the web interface
        * Note that Flower only shows tasks that ran *while Flower was running*
    * Most configuration parameters are shared with RabbitMQ and were configured in the previous
      step
    

 * Configure Celery Worker(s) to Run as Daemon
    * Examine EDD's celery configuration file, `edd/edd/celeryconfig.py` and make any changes
      required. The defaults should be fine as an initial starting point.
    * Create an unprivileged Linux account for running celery workers `useradd -r celery`
    * Inspect edd/celery/debian/edd_celeryd.config and adjust values for your system. The defaults
      should be fine for development. For reference, see
      [Running the Worker as a daemon](http://celery.readthedocs.org/en/latest/tutorials/daemonizing.html)
    * Install celery daemon script and configuration file

        cd edd/celery/debian
        sudo cp edd_celeryd.script /etc/init.d/edd_celeryd
        sudo edd_celeryd.config /etc/defaults/edd_celeryd

    * Test the service: `service edd_celeryd start`
 
 * Django setup <a name = "Django_Deb"/>
    * See section Database Conversion below if migrating from CGI EDD database
    * `./manage.py collectstatic` to ensure that all static files are in one spot
 
 * Apache setup <a name = "Apache_Deb"/>
    * mod_wsgi: `sudo apt-get install libapache2-mod-wsgi`
    * Add inside `VirtualHost` config:

        Alias   /robots.txt     /var/www/robots.txt
        Alias   /favicon.ico    /var/www/favicon.ico
        Alias   /media/         /var/www/uploads/
        Alias   /static/        /var/www/${SITE}/static/

        WSGIDaemonProcess   edd     python-path=/var/www/${SITE}:/usr/local/virtualenvs/${SITE}/lib/python2.7/site-packages/
        WSGIProcessGroup    edd
        WSGIScriptAlias     /       /var/www/${SITE}/edd/wsgi.py

 * TODO complete Debian instructions
 
---------------------------------------------------------------------------------------------------

<a name="Helpful_Python"></a>
## Helpful Python Packages 
 * django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in settings.py INSTALLED_APPS

<a name="BuildTools"></a>
## Build Tools 
 * The EDD makes use of Node.js and grunt for builds; it would be a good idea to:
    * `brew install node`
    * `sudo npm install -g grunt-cli`
    * `sudo npm install grunt`

 * EDD uses [TypeScript](http://typescriptlang.org) for its client-side interface; you will want:
    * The following are included by default in the EDD codebase.
        * `sudo npm install -g typescript@1.3.0`
        * `sudo npm install grunt-typescript`

 * Compile changes in `*.ts` to `*.js` by simply running `grunt` from the edd base directory
 
<a name="ControllingDependencies"></a>
## Controlling EDD's Dependencies
EDD has a number of dependencies, all of which may need to be monitored/managed during development,
testing, and production. This document contains directions for daemonizing most of them, so
developer interaction with can often be minimal.  As needed, use the following basic commands and
URL's to interact with them.

* PostgreSQL: installed as a daemon by default on all OS's. You probably won't need to mess
  with it.
* Solr 
    * Solr 4.X / Tomcat
        * Sample monitoring interface URL: 
        * `catalina start` / `catalina stop`
    * Solr 5.+:
        * Sample monitoring interface URL: [http://localhost:8983/](http://localhost:8983/)
        * `solr start` / `solr stop`
* RabbitMQ
    * Sample monitoring interface URL: [http//localhost:15672/](http://localhost:15672/)
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
    * Other useful management commands are in the [docs](https://www.rabbitmq.com/man/rabbitmqctl.1.man.html)
* Celery / Flower
    * Sample Flower URL: [http://localhost:5555/](http://localhost:5555/)
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
        * For installations on an unsafe network, consider alternate
          [authentication](https://github.com/mher/flower/wiki/Authentication) flags for Flower
        * Note that the `-conf` option doesn't seem to work according to the sample in the
          instructions, or via attempted variations on that
          [example](http://flower.readthedocs.org/en/latest/config.html)

<a name="DbConversion"></a>
## Database Conversion
This section provides instructions for converting the EDD database to handle a new schema, or on
populating a new deployment with existing data.

 * Run edd's 'reset_db.sh' to execute all of the steps below.

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
        * There is a problem with `registration` app in Django 1.8+; comment the app out in
          `./edd/settings.py` before running `migrate`, then uncomment and run again
    * Fill in data with `psql edddjango < convert.sql`
 * Set user permissions
    * If this is a development database, manually edit the auth_user table to set `is_superuser`
      and `is_staff` to true for your account.
    * `psql edddjango -c "update auth_user set is_superuser=true, is_staff=true where username =
      'YOUR_USERNAME'"`

<a name="ConfigureRabbitMQ"></a>
## Configure RabbitMQ for Celery and EDD
Many possible clustering, exchange, queue, worker, and back-end configurations are possible, and
will depend on the volume and resource requirements of EDD's traffic. Sample configuration below
sets up a single exchange, queue, and worker for EDD, using a PostgreSQL back end. Use custom
configuration and modify EDD's celeryconfig.py to fit your environment, using `remote_task.py` as
a reference for all of the tasks EDD schedules on Celery workers. Also consider enabling SSL on
RabbitMQ, Celery, and Flower, depending on whether all of the above, as well as any linked ICE
instance, are hosted on a single trusted network.
   
For reference, see:
 * the RabbitMQ [Production Checklist](https://www.rabbitmq.com/production-checklist.html)
 * the Celery [security configuration](http://celery.readthedocs.org/en/latest/configuration.html#security)
 * the Celery [configuration reference](http://celery.readthedocs.org/en/latest/configuration.html)
 * and other related documents (some mentioned below).

  
 * TODO: update docs to reflect DB configured via server.cfg
 * Confirm that RabbitMQ is running. Commands below won't work otherwise.
 * Create a "/edd" virtual host for EDD use. This helps enforce good separation between multiple
   apps that may be using the same RabbitMQ server.

    sudo rabbitmqctl add_vhost /edd

 * Remove RabbitMQ's default `guest` account

    sudo rabbitmqctl delete_user guest

 * Create a RabbitMQ account with limited permissions for EDD
    * Create a password for the EDD's RabbitMQ account. Avoid special characters since the
        password must be provided to the Celery worker via a URL.
        * Update `edd/server.cfg` to enter the password in `rabbitmq.edd_pass` 
        * `sudo rabbitmqctl add_user edd_user EDD_RABBITMQ_PASSWORD`
            * replacing the password with your value
    * Grant appropriate permissions to edd_user on the "/edd" virtual host
        * `sudo rabbitmqctl set_permissions -p /edd edd_user ".*" ".*" ".*"`
        * TODO: consider tighter [Access Controls](https://www.rabbitmq.com/access-control.html)
          to determine controls needed for EDD virtual environment
 * Create an administrative RabbitMQ account for Flower to use in accessing Celery's RabbitMQ
   management API (same password special character limitations as above)
    * Update edd/server.cfg to enter the password in `rabbitmq.mgmt_pass`
    * `sudo rabbitmqctl add_user bunny 'RABBITMQ_MGMT_PASSWORD'`. Note that single-quotes prevent the shell from interpreting special characters in the password.
        * replacing the password with your value
    * `sudo rabbitmqctl set_permissions -p / bunny ".*" ".*" ".*"`
    * `sudo rabbitmqctl set_permissions -p /edd bunny ".*" ".*" ".*"`
    * `sudo rabbitmqctl set_user_tags bunny administrator`
    * TODO: experiment with limiting permissions on this account to see whether it still works
      with Celery/Flower, and/or separating Flower & RabbitMQ management accounts.
             
 * If RabbitMQ client applications (e.g. Celery, Flower, and EDD) are all deployed on a single
    host (e.g. in development), configure RabbitMQ to reject all access attempts from remote hosts.
    * Copy the sample configuration file to the location where RabbitMQ will search for it, and
      adjust its permissions. See for reference,
        [RabbitMQ file locations](https://www.rabbitmq.com/relocate.html).
        * For Debian: (note that the rabbitmq linux account is created by apt-get installation):

            cd /usr/share/doc/rabbitmq-server/
            sudo cp rabbitmq.config.example.gz /etc/rabbitmq/rabbitmq.config.gz
            cd /etc/rabbitmq/
            gunzip rabbitmq.config.gz
            sudo chown rabbitmq rabbitmq.config
            sudo chmod o-r rabbitmq.config
            sudo vi rabbitmq.config

        * For OSX, create required directories and copy/edit the RabbitMQ configuration file

            mkdir /var/lib/rabbitmq
            mkdir /usr/local/var/log/rabbitmq
            cd /usr/local/etc/rabbitmq/
            cp rabbitmq.config.example rabbitmq.config
            sudo vi rabbitmq.config
          
    * Configure the loopback_users in `rabbitmq.config` (often in `/etc/rabbitmq/rabbitmq.config`),
      or use `brew list rabbitmq` to find its parent directory
        * Search the file for the first occurence of "localhost", and add lines following the
          example comment that will cause RabbitMQ to ignore all remote requests

            %% Disable all remote access to RabbitMQ
                {tcp_listeners, [{"127.0.0.1", 5672},
                                 {"::1",       5672}]},

        * Remove remote access to the "edd_user" RabbitMQ account. Search the file for `loopback`
            * Uncomment the line, and add the edd_user. When finished, the entire line should be
              (no trailing comma!):

                {loopback_users, [<<"guest">>, <<"edd_user">>]} %%  only allow edd_user access from localhost

 * If RabbitMQ client applications (e.g. Celery, Flower, and EDD) run on separate hosts on an
   untrusted network, take additional steps to secure the system
    * Limit RabbitMQ access to trusted servers only. See sample tcp_listeners configuration above.
    * [Configure RabbitMQ for SSL]){https://www.rabbitmq.com/ssl.html}
        * TODO: additional work to do in configuring clients to use SSL. Also see:
            * Celery [security configuration](http://celery.readthedocs.org/en/latest/configuration.html#security)
            * Celery [message signing](http://celery.readthedocs.org/en/latest/userguide/security.html#message-signing)
            * Celery Flower [configuration options](http://flower.readthedocs.org/en/latest/config.html#options)
                * specifically cacerts, certfile, keyfile
            * TODO: also consider Flower's
              [persistent mode](http://flower.readthedocs.org/en/latest/config.html#persistent),
              which has next to zero documentation, but might account for results dissappearing
              from the web interface on restart
            * TODO: investigate Flower's missing indication of tasks successfully submitted while
              Flower / Celery were up, but shortly after RabbitMQ was restarted.
          
 * Other security concerns
    * on Debian, `.erlang.cookie` is in `/var/lib/rabbitmq`, and only visible to `rabbitmq` user
      (fulfills security mention in [docs](https://www.rabbitmq.com/production-checklist.html)).
      On single-user development machines, this shouldn't be a concern.
 * TODO: for production, configure log rotation and resource use. See related subsections of the
   [RabbitMQ Debian Install Instructions](https://www.rabbitmq.com/install-debian.html)
 * TODO: configure log rollover and upper bounds for disk/memory use. See the
   [RabbitMQ Production Checklist](https://www.rabbitmq.com/production-checklist.html)
 * If running, restart RabbitMQ to pick up all the preceding configuration changes, checking logs
   for related error messages:
    * For Debian:

        sudo service rabbitmq-server stop
        sudo service rabbitmq-server start

    * For OSX:

        sudo rabbitmqctl stop
        sudo rabbitmq-server

 * TODO: see Celery's section on
    [logging and intrusion detection](http://celery.readthedocs.org/en/latest/userguide/security.html#logs)
    * Also see LOGGING variable in `edd/settings.py` -- may already take care of lots of what we
      need for Celery
 * TODO: -- important, but we're not at this step yet. Test configuration by launching RabbitMQ,
    Celery, and Flower (in that order). See [Controlling Dependencies](#ControllingDependencies).

<a name="Solr_Test"></a>
## Solr Tests 
 * Tests in this project make use of a `test` core, which will need to be created
    * Create a new data directory `mkdir -p /usr/local/var/solr/data/test`
    * Add new line to `solr.xml` using same studies `instanceDir` and new data directory
      `<core name="tests" instanceDir="./cores/studies" dataDir="/usr/local/var/solr/data/test"/>`

<a name="PythonPackages"></a>
## Required Python Package Reference 
This section describes required Python packages for EDD. This listing is for reference only, since
    EDD's `requirements.txt` should normally be used to install required packages.

 * N.B. probably need to re-install `cryptography` to compile in correct OpenSSL
 * [Arrow](http://crsmithdev.com/arrow/)
      * "Arrow is a Python library that offers a sensible, human-friendly approach to creating,
        manipulating, formatting and converting dates, times, and timestamps."
      * `sudo pip install arrow`
 * [cryptography](https://cryptography.io/en/latest/)
    * Adds some crypto libraries to help play nice with TLS certificates
    * Needs additional env flags to ensure using Brew-installed OpenSSL
    * `env ARCHFLAGS="-arch x86_64" LDFLAGS="-L/usr/local/opt/openssl/lib"
        CFLAGS="-I/usr/local/opt/openssl/include" pip install cryptography`
        * May need to include `--upgrade --force-reinstall` flags after `install` in prior
          command
 * [Celery](http://celery.readthedocs.org/en/latest/index.html) / [Flower](http://flower.readthedocs.org/en/latest/)
    * Distributed task queue that similifies administration and error detection of EDD's
      communication with ICE

        sudo pip install celery==3.1.18
        sudo pip install flower==0.8.2
        sudo pip install SQLAlchemy==1.0.8

 * [Django](https://www.djangoproject.com/)
    * MVC web framework used to develop EDD.
    * `sudo pip install Django`
 * [django-auth-ldap](https://pythonhosted.org/django-auth-ldap/index.html)
    * A Django application providing authentication with an LDAP backend.
    * `sudo pip install django-auth-ldap`
 * [django-extensions](https://django-extensions.readthedocs.org/en/latest/)
    * Adds additional management extensions to the Django management script.
    * `sudo pip install django-extensions`
 * [django-hstore](https://github.com/djangonauts/django-hstore)
    * Supports the PostgreSQL HStore extension for key-value store columns.
    * `sudo pip install django-hstore`
    * Ensure that the hstore extension is enabled on the PostgreSQL template1 database before
      use; details in django-hstore documentation, and command provided in PostgreSQL setup
      above.
    * Requires running `python manage.py collectstatic` to copy static files in all apps to a
      common location; this may need to be run every deploy.
 * [django-registration](http://django-registration-redux.readthedocs.org/en/latest/index.html)
    * A Django application allowing for local-account registration and creation.
    * `sudo pip install django-registration-redux`
    * Version 1.1 used with Django 1.8+ results in a warning at server startup; to patch:
        * locate _`ENV`_`/site-packages/registration/models.py`
        * edit line 187 `user = models.ForeignKey(…` to read `user = models.OneToOneField(…`
        * change results in no model changes, merely removes the warning
    * [django-threadlocals](https://pypi.python.org/pypi/django-threadlocals/)
      <a name="django-threadlocals"></a>
        * A Django middleware for storing the current request in a thread.local
            * Version on PyPI is Python2 incompatible! It only needs one-liner import change to
              work.
            * Open in vim `vi ${venv}/lib/python2.7/site-packages/threadlocals/middleware.py`, for
              example `/usr/local/lib/python2.7/site-packages/`
            * In vim: `s/^from threadlocals\.threadlocals import/from .threadlocals import/)`

                cd /Users/YOURUSERNAME/.virtualenvs/edd/lib/python2.7/site-packages/threadlocals/
                vim middleware.py

 * [requests](http://docs.python-requests.org/en/latest/)
    * "Requests is an Apache2 Licensed HTTP library, written in Python, for human beings."
    * `sudo pip install requests[security]`
 * [psycopg2](http://initd.org/psycopg/)
    * Database driver/adapter for PostgreSQL in Python.
    * `sudo pip install psycopg2`
 * [python-ldap](http://www.python-ldap.org/)
    * Object-oriented client API for accessing LDAP directories.
    * `sudo pip install python-ldap`
