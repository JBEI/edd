# Experiment Data Depot

 * The Experiment Data Depot (EDD) is a web-based repository of processed data
    obtained via experimentation.
 * [edd.jbei.org](https://edd.jbei.org).

## System Pre-requisites
### MacOS X

 * Get required passwords from a teammate
    * JBEI_AUTH - to configure LDAP SSL handling and EDD's server.cfg
	* edduser - the password to the production EDD instance. You'll need this to copy its data for local development work.
	
 * Install XCode (and associated Developer Tools) via the App Store
    * As of OS X 10.9 "Mavericks": `xcode-select --install` to just get command-line tools
    * Establish `/usr/include` with: ``sudo ln -s `xcrun --show-sdk-path`/usr/include /usr/include``

 * [Homebrew](http://brew.sh)
    * `ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
    * `brew doctor`

 * Replace default OS X version of Python with the more up-to-date Homebrew version
    * `brew install python`
    * May need to reload shell to see the proper Python version

 * Replace default OS X version of OpenSSL
    * `brew install OpenSSL`

 * [pip](https://pip.pypa.io)
    * Should be installed as part of Homebrew install of Python
    * For latest version: `sudo pip install --upgrade --no-use-wheel pip`
    * Also a good idea to: `sudo pip install --upgrade setuptools`
    * Manually install by downloading get-pip.py, run `sudo python get-pip.py`

 * [virtualenvwrapper](http://virtualenvwrapper.readthedocs.org/en/latest/install.html)
    * Makes dependency tracking, development, and deployment easier
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            export WORKON_HOME=$HOME/.virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh

    * Make a new virtualenv, e.g. `mkvirtualenv edd`
        * `deactivate` to return to regular global python environment
        * `workon edd` to switch back to edd python environment

 * PostgreSQL (required for installing psycopg2 driver)
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
				
 * Tomcat / Solr ( For older 4.X Solr. Skip this item for Solr 5.0+)
    * Install a JDK8+ from [Oracle](http://java.oracle.com)
    * `brew install tomcat solr`
    * Link to easily access tomcat and solr install directories:

             ln -s /usr/local/Cellar/tomcat/(VERSION)/libexec/ /usr/local/tomcat
             ln -s /usr/local/Cellar/solr/(VERSION)/ /usr/local/solr

    * For solr 4.x: Copy Solr libraries to Tomcat lib:
       `cp /usr/local/solr/server/lib/ext/* /usr/local/tomcat/lib/`
    * Create Solr directories:
       `mkdir -p /usr/local/var/solr/data`
    * Copy Solr configuration from `edd-django/solr` to `/usr/local/var/solr`
    * `cp /usr/local/solr/server/webapps/solr.war /usr/local/tomcat/webapps/solr.war`

    * Add a `setenv.sh` to `/usr/local/tomcat/bin/` and `chmod +x /usr/local/tomcat/bin/setenv.sh`
    
             #!/bin/bash
             JAVA_OPTS="$JAVA_OPTS -Dsolr.solr.home=/usr/local/var/solr"

     * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhostcd 
         * find `<Connector port="8080" ...`
         * add attribute `address="localhost"`
     * Service is controlled with `catalina` command; `catalina start` and `catalina stop`
     * Access admin interface via <http://localhost:8080/solr>

 * Solr (For versions 5.0+. Optional if using non-local server for Solr)
    * Starting with 5.0, Solr no longer supports deployment to a separate application server. It's designed to run as a separate server.
    * Install a JDK8+ from [Oracle](http://java.oracle.com)
    * `brew install solr`
    * Link to easily access solr install directory:

            ln -s /usr/local/Cellar/solr/(VERSION)/ /usr/local/solr

    * TODO: re-examine Solr directions from this point forward.
	   * Need to distill guidance in:
	      * [Installing Solr](https://cwiki.apache.org/confluence/display/solr/Installing+Solr)
	   	  * [Upgrading to 5.0](https://cwiki.apache.org/confluence/display/solr/Upgrading+a+Solr+4.x+Cluster+to+Solr+5.0#UpgradingaSolr4.xClustertoSolr5.0-Step2:InstallSolr5asaService)
		  * [Solr.xml format changes](http://wiki.apache.org/solr/Solr.xml%204.4%20and%20beyond)
		  * [Core Admin](http://wiki.apache.org/solr/CoreAdmin) -- shows details of solr.xml -- see newer format required in 5.0
    * Create Solr data directories: TODO: still necessary?
      `mkdir -p /usr/local/var/solr/data`
    * Copy Solr configuration from `edd-django/solr` to solr data directory `usr/local/Cellar/solr/(VERSION)/server/solr` //TODO: correct version

    * Modify `/usr/local/tomcat/conf/server.xml` to only listen on localhostcd 
        * find `<Connector port="8080" ...`
        * add attribute `address="localhost"`
    * Service is controlled with `solr` command; `solr start` and `solr stop`
    * Access admin interface via <http://localhost:8983/solr/#/>

 * Install python packages (these can be combined into one `sudo pip install`)
    * All the following can be installed to your virtualenv with 
            cd code/edd-django
            pip install -r requirements.txt
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
            # locate _`ENV`_`/site-packages/registration/models.py`
            # edit line 187 `user = models.ForeignKey(…` to read `user = models.OneToOneField(…`
            # change results in no model changes, merely removes the warning
    * [requests](http://docs.python-requests.org/en/latest/)
        * "Requests is an Apache2 Licensed HTTP library, written in Python, for human beings."
        * `sudo pip install requests[security]`
    * [psycopg2](http://initd.org/psycopg/)
        * Database driver/adapter for PostgreSQL in Python.
        * `sudo pip install psycopg2`
    * [python-ldap](http://www.python-ldap.org/)
        * Object-oriented client API for accessing LDAP directories.
        * `sudo pip install python-ldap`

 * Use EDD's `server.cfg-example` as a template to create a `server.cfg` file
    * Need to put in appropriate values for `site.secret`, `db.pass`, and `ldap.pass`
		* db.pass is the password you created for your local edduser account
		* ldap.pass in the JBEI_AUTH password
    * Update `site`, `db`, `solr`, `ldap`, and `ice` for appropriate connection parameters
    * _*DO NOT CHECK THIS FILE INTO SOURCE CONTROL*_ This file is included by default in EDD's `.gitignore` file, so you'll have to work hard to commit it to Git by mistake.


 * Configure LDAP SSL handling in `/etc/openldap/ldap.conf`
    * For OS X 10.9.x "Mavericks" or 10.10.x "Yosemite"
		* `sudo su`
        * Pull CA certificates from `identity.lbl.gov`
            * As root in `/System/Library/OpenSSL/certs`
                * `openssl s_client -showcerts -connect identity.lbl.gov:636 > godaddy.crt`
                * Edit `godaddy.crt` to remove all non-certificate blocks (outside BEGIN/END), and the
                  first certificate block (the identity.lbl.gov certificate).
        * Edit as root `/etc/openldap/ldap.conf`
            * Add line `TLS_CACERTDIR   /System/Library/OpenSSL/certs`
            * Add line `TLS_CACERT      /System/Library/OpenSSL/certs/godaddy.crt`
			** TODO make edits very explicit
        * Test with:

                ldapsearch -H ldaps://identity.lbl.gov -b "ou=People,dc=lbl,dc=gov" -W \
                    -D "uid=jbei_auth,cn=operational,cn=other" -s base "objectclass=*"
					
		* Output should contain `result: 0 Success`

    * For problems in OS X 10.10.x "Yosemite":
        * Problems occurred for some users in certificate checking with ldapsearch
        * Work-around, comment out the `TLS_REQCERT` line

 * The EDD should now be ready to run with an empty database. See [Database Conversion] below for instructions on copying data.
    * From project root, `./manage.py migrate` will create the needed database tables.
    * `./manage.py runserver` will launch the application at <http://localhost:8000/>
    * `./manage.py test main` will run unit tests on the main application
        * Solr tests make use of a different core, see Solr section below.

### Debian (for deployment)
 * Required `.deb` packages
    * `sudo apt-get install pip` for PyPI/pip python package manager
    * `sudo apt-get install libpq-dev` for headers required by psycopg2
    * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers required by python-ldap
    * `sudo apt-get install python-dev libffi-dev` for headers required by cryptography

 * Configure LDAP SSL handling in `/etc/ldap/ldap.conf`
    * Add line `TLS_CACERTDIR   /etc/ssl/certs`
    * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`

 * Check out code to `/var/www/${SITE}`

 * Python packages
    * `sudo pip install virtualenvwrapper`
    * Add to your shell startup (e.g. `~/.bashrc`) and `source` your startup file

            export WORKON_HOME=/usr/local/virtualenvs
            source /usr/local/bin/virtualenvwrapper.sh
			
	* Test your work by launching a new Terminal and running `echo $WORKON_HOME`
			* If no value is printed, consider adding a ``~/.bash_profile`` file to force your .bashrc to be executed. See [explanation](http://apple.stackexchange.com/questions/119711/why-mac-os-x-dont-source-bashrc)
				
				[[ -r ~/.bashrc ]] && . ~/.bashrc

    * `mkvirtualenv edd.jbei.org` or `workon edd.jbei.org`
    * `pip install -r /path/to/project/requirements.txt` to install python packages to virtualenv

 * \(_optional_\) `sudo apt-get install tomcat7` for Tomcat/Solr
    * Download [Solr](http://lucene.apache.org/solr/) and copy WAR to webapps folder

 * Django setup
    * See section Database Conversion below if migrating from CGI EDD database
    * `./manage.py collectstatic` to ensure that all static files are in one spot

 * Apache setup
    * mod_wsgi: `sudo apt-get install libapache2-mod-wsgi`
    * Add inside `VirtualHost` config:

            Alias   /robots.txt     /var/www/robots.txt
            Alias   /favicon.ico    /var/www/favicon.ico
            Alias   /media/         /var/www/uploads/
            Alias   /static/        /var/www/${SITE}/static/

            WSGIDaemonProcess   edd     python-path=/var/www/${SITE}:/usr/local/virtualenvs/${SITE}/lib/python2.7/site-packages/
            WSGIProcessGroup    edd
            WSGIScriptAlias     /       /var/www/${SITE}/edd/wsgi.py

 *
 * TODO complete Debian instructions
 
## Helpful Python Packages
 * django-debug-toolbar `pip install django-debug-toolbar`
    * Include `debug_toolbar` in settings.py INSTALLED_APPS

## Build Tools
 * This project makes use of Node.js and grunt for builds; it would be a good
    idea to:
    * `brew install node`
    * `sudo npm install -g grunt-cli`
    * `sudo npm install grunt`

 * EDD uses [TypeScript](http://typescriptlang.org) for its client-side
    interface; you will want:
    * `sudo npm install -g typescript`
    * `sudo npm install grunt-typescript`

 * Compile changes in `*.ts` to `*.js` by simply running `grunt` 

## Database Conversion
 * `pg_dump -i -h postgres.jbei.org -U edduser -F p -b -v -f edddb.sql edddb` copies old database
   to a file `edddb.sql`
 * Create a database for the django application
    * `psql -c 'create database edddjango;'` to create the database
    * `psql -d edddjango -c 'create schema old_edd;'` to make a schema for migrating data
    * `p`
 * Run commands below to edit the SQL file. They prepend the new schema to the `SET search_path` line, and replace all
    instances of `public.` with `old_edd.` (or whatever the schema name is) with:
    
        cat edddb.sql | sed 's#SET search_path = #SET search_path = old_edd, #g' | \
        sed 's#public\.#old_edd.#g' > edddb_upd.sql

 * Copy the dump in with `psql edddjango < edddb_upd.sql`
 * Initialize the django schema
    * Run `./manage.py migrate` to create schema for django
        * There is a problem with `registration` app in Django 1.8+; comment the app out in
          `./edd/settings.py` before running `migrate`, then uncomment and run again
    * Fill in data with `psql edddjango < convert.sql`

## Solr
 * Tests in this project make use of a `test` core, which will need to be created
    * Create a new data directory `mkdir -p /usr/local/var/solr/data/test`
    * Add new line to `solr.xml` using same studies `instanceDir` and new data directory
        `<core name="tests" instanceDir="./cores/studies" dataDir="/usr/local/var/solr/data/test"/>`

