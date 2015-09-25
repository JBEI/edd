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
       * Python Packages
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
    Get required passwords from a teammate
    * JBEI_AUTH - to configure LDAP SSL handling and EDD's server.cfg
    * edduser - the password to the production EDD instance. You'll need this to copy its data for
      local development work. See [Database Conversion](#DbConversion)
   
### Mac OS X
This section contains directions for setting up a development environment on EDD in OSX.
<a name="XCode"/>
* XCode
    Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
    * Establish `/usr/include` with:
      ``sudo ln -s `xcrun --show-sdk-path`/usr/include /usr/include``
<a name="HomeBrew"/>
* [Homebrew][2]
    * `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
    * `brew doctor`
<a name="Python"/>
* Python
    * Replace default OS X version of Python with the more up-to-date Homebrew version
    * `brew install python`
    * May need to reload shell to see the proper Python version
<a name="OpenSSL"/>
* Replace default OS X version of OpenSSL
    * `brew install OpenSSL`
<a name="Pip"/>
* [Pip][3]
    * Should be installed as part of Homebrew install of Python
    * For latest version: `sudo pip install --upgrade --no-use-wheel pip`
    * Also a good idea to: `sudo pip install --upgrade setuptools`
    * Manually install by downloading get-pip.py, run `sudo python get-pip.py`
<a name="VirtualEnvWrapper"/>
* [virtualenvwrapper][4]
    * Makes dependency tracking, development, and deployment easier
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            export WORKON_HOME=$HOME/.virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh

    * Make a new virtualenv, e.g. `mkvirtualenv edd`
        * `deactivate` to return to regular global python environment
        * `workon edd` to switch back to edd python environment
        * run under `workon edd` for the remainder of the pip installs in this document. This
          will isolate your EDD Python configuration from any other changes you make to your
          system.
<a name="PostgreSQL"/>
* PostgreSQL (required for installing psycopg2 driver, do not need to rum database locally)
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

<a name="Solr_Tomcat"/>
* Solr / Tomcat ( For older 4.X Solr. Skip this item for Solr 5.0+)
    * At present, this is the recommended version until EDD and these directions are updated for
      Solr 5.0+
    * Install a JDK8+ from [Oracle][5]
    * `brew install tomcat`
    * `brew install homebrew/versions/solr4`
    * Link to easily access tomcat and solr install directories:
        * `ln -s /usr/local/Cellar/tomcat/(VERSION)/libexec/ /usr/local/tomcat`
        * `ln -s /usr/local/Cellar/ solr4/(VERSION)/ /usr/local/solr`
    * Copy Solr libraries to Tomcat lib:
        * For solr 4.x:
          `cp /usr/local/solr/example/lib/ext/* /usr/local/tomcat/lib/`
        * For solr 5.x: Copy Solr libraries to Tomcat lib. Complete directions for this version may
          not be known.
          `cp /usr/local/solr/server/lib/ext/* /usr/local/tomcat/lib/`
    * Create Solr directories: `mkdir -p /usr/local/var/solr/data`.
        * Note that `data/` must exist for Solr to work, but files are purposefully copied to its
          parent, `/usr/local/var/solr/` in subsequent steps.
    * Copy Solr configuration from `edd-django/solr` to `/usr/local/var/solr/`
    * `cp /usr/local/solr/libexec/dist/solr-(VERSION).war /usr/local/tomcat/webapps/solr.war`


    * Add a `setenv.sh` to `/usr/local/tomcat/bin/` and `chmod +x /usr/local/tomcat/bin/setenv.sh`
    
            #!/bin/bash
            JAVA_OPTS="$JAVA_OPTS -Dsolr.solr.home=/usr/local/var/solr"

    * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhost
        * find `<Connector port="8080" ...`
        * add attribute `address="localhost"`
    * Service is controlled with `catalina` command; `catalina start` and `catalina stop`
    * Access admin interface via <http://localhost:8080/solr>
     * TROUBLESHOOTING:
        * If you reinstall Solr, delete the contents of the solr cache
            * `rm -r /usr/local/var/solr/data/*`
        * Also make sure there is not another cache in your EDD directory
            * `rm -r (EDD DIRECTORY)/solr/data/*`

<a name="Solr"/>
* Solr (For versions 5.0+. Optional if using non-local server for Solr)
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
    * Access admin interface via <http://localhost:8983/solr/#/>

* Install python packages
    
            cd code/edd-django
            sudo pip install -r requirements.txt

    * See [Python Packages](#PythonPackages) for a detailed list

<a name="EDD_Config"/>
* Update EDD Configuration Files
    * Use EDD's `server.cfg-example` as a template to create a `server.cfg` file
    * Need to put in appropriate values for `site.secret`, `db.pass`, and `ldap.pass`
        * db.pass is the password you created for your local edduser account
        * ldap.pass in the JBEI_AUTH password
    * Update `site`, `db`, `solr`, `ldap`, and `ice` for appropriate connection parameters
    * _*DO NOT CHECK THIS FILE INTO SOURCE CONTROL*_ ! This file is included by default in EDD's
      `.gitignore` file, so you should have to work hard to commit it to Git by mistake.

<a name="LDAP_SSL"/>
* Configure LDAP SSL
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

<a name="Build_Tools"/>
* Install and run [Build Tools](#BuildTools)

<a name="Configure_DB"/>
* Configure Database
    * See [Database Conversion](#DbConversion) below for instructions that also apply to initial
      database creation

<a name="Start_EDD"/>
* Start EDD
    * If not already running, start supporting services
        * Solr
            * 4.X: `catalina start` to start Tomcat and Solr
            * 5+: `solr start` to start standalone Solr server
    * `./manage.py runserver` will launch EDD at <http://localhost:8000/>
    * `./manage.py test main` will run unit tests on the main application
        * Solr tests make use of a different core, see Solr section below.

<a name="Build_Indices"/> 
* Build Solr Indices
    * `./manage.py edd_index`

---------------------------------------------------------------------------------------------------

<a name="Debian"/>
### Debian (for deployment) <a name="Debian_Packages"/>

* Required `.deb` packages
    * `sudo apt-get install python-pip` for PyPI/pip python package manager
    * `sudo apt-get install postgresql-client` for commands used to copy database
    * `sudo apt-get install libpq-dev` for headers required by psycopg2
    * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers required by
      python-ldap
    * `sudo apt-get install python-dev libffi-dev` for headers required by cryptography
    * `sudo apt-get install libatlas-dev liblapack-dev gfortran` for packages required by SciPy
    * `sudo apt-get install libbz2-dev` for packages required by libsmbl

<a name="Configure_LDAP"/>
* Configure LDAP SSL handling in `/etc/ldap/ldap.conf`
    * Add line `TLS_CACERTDIR   /etc/ssl/certs`
    * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`

<a name="Check_Out"/>
* Check out code to `/var/www/${SITE}`

<a name="Python_Packages_Deb"/>
* Python packages
    * `sudo pip install virtualenvwrapper`
    * `mkdir -p /usr/local/virtualenvs`
        * TODO: should look into permissions on directory containing virtualenvs
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            if [ -f /usr/local/bin/virtualenvwrapper.sh ]; then
                export WORKON_HOME=/usr/local/virtualenvs
                source /usr/local/bin/virtualenvwrapper.sh
            fi

    * Test your work by launching a new Terminal and running `workon`
        * If nothing happens, it works!
        * If you get `command not found`, virtualenvwrapper is not properly set up.
    * `mkvirtualenv edd.jbei.org` or `workon edd.jbei.org`
    * `pip install -r /path/to/project/requirements.txt` to install python packages to virtualenv

<a name="Solr_Tomcat_Deb"/>
* \(_optional_\) `sudo apt-get install tomcat7` for Tomcat/Solr
    * Download [Solr](http://lucene.apache.org/solr/) and copy WAR to webapps folder

<a name="Django_Deb"/>
* Django setup
    * See section Database Conversion below if migrating from CGI EDD database
    * `./manage.py collectstatic` to ensure that all static files are in one spot
    * `./manage.py edd_index` to populate search indices

<a name="Apache_Deb"/> 
* Apache setup
    * mod_wsgi: `sudo apt-get install libapache2-mod-wsgi`
    * See `apache.conf-sample` for example of how to configure Apache
    * Ensure that `/var/www/uploads/` exists and is writable by user `www-data`
* TODO complete Debian instructions
 
---------------------------------------------------------------------------------------------------

<a name="Helpful_Python"/>
## Helpful Python Packages 
* django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in local_settings.py INSTALLED_APPS

<a name="BuildTools"/>
## Build Tools 
* The EDD makes use of Node.js and grunt for builds; it would be a good idea to:
    * `brew install node`
    * `sudo npm install -g grunt-cli`
    * `sudo npm install grunt`

* EDD uses [TypeScript](http://typescriptlang.org) for its client-side interface; you will want:
    * `sudo npm install -g typescript`
    * `sudo npm install grunt-typescript`

* Compile changes in `*.ts` to `*.js` by simply running `grunt` from the edd base directory

<a name="DbConversion"></a>
## Database Conversion

This section provides instructions for converting the EDD database to handle a new schema, or on
populating a new deployment with existing data.

* Run edd's 'reset_db.sh' to execute all of the steps below.
* Create a SQL dump file to capture the contents of the existing EDD database
 
        pg_dump -i -h postgres.jbei.org -U edduser -F p -b -v -f edddb.sql edddb

   * Enter remote edduser password (NOT the one you created for your local instance)
 
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

<a name="Solr_Test"/>
## Solr Tests 
* Tests in this project make use of a `test` core, which will need to be created
    * Create a new data directory `mkdir -p /usr/local/var/solr/data/test`
    * Add new line to `solr.xml` using same studies `instanceDir` and new data directory
        `<core name="tests" instanceDir="./cores/studies" dataDir="/usr/local/var/solr/data/test"/>`

<a name="PythonPackages"/>
## Required Python Package Reference 
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
