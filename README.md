# Experiment Data Depot

 * The Experiment Data Depot (EDD) is a web-based repository of processed data
    obtained via experimentation.
 * [edd.jbei.org](https://edd.jbei.org).

## System Pre-requisites
### Debian
 * `sudo apt-get install -t testing libpq-dev` for headers required by psycopg2
 * `sudo apt-get install libldap2-dev libsasl2-dev libssl-dev` for headers
    required by python-ldap
 * Configure LDAP SSL handling in `/etc/ldap/ldap.conf`
    * Add line `TLS_CACERTDIR   /etc/ssl/certs`
    * Add line `TLS_CACERT  /etc/ssl/certs/ca-certificates.crt`
 
## Python Packages
### Required Packages
 * Arrow `sudo pip install arrow`
 * Django `sudo pip install Django`
 * django-auth-ldap `sudo pip install django-auth-ldap`
 * django-extensions `sudo pip install django-extensions`
 * django-registration `sudo pip install django-registration-redux`
 * requests `sudo pip install requests`
 * psycopg2 `sudo pip install psycopg2`
 * python-ldap `sudo pip install python-ldap`

### Helpful Packages
 * django-debug-toolbar `pip install django-debug-toolbar`
    Include `debug_toolbar` in settings.py INSTALLED_APPS

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

## Database conversion
 1. `pg_dump -i -h postgres -U edduser -F p -b -v -f edddb.sql edddb`
 2. Create a new schema in the django database, e.g. `CREATE SCHEMA edd_old`
 3. Edit the SQL file to prepend the new schema to the `SET search_path` line,
    and replace all instances of `public.` with `edd_old.` (or whatever the
    schema name is)
 4. `psql edddjango < edddb.sql`
 5. `psql edddjango < convert.sql`

## Solr
### Solr Setup on dev MacOS Environment
  * Check out old Perl edd sources

  * Install tomcat7:
    * `brew install tomcat`
    * Make link to easily access tomcat install directory:
    * `ln -s /usr/local/Cellar/tomcat/7.0.54/libexec/ /usr/local/tomcat`

  * Download Solr (http://lucene.apache.org/solr/) and install:
    * Create Solr directories:
    * `mkdir -p /usr/local/var/solr`
    * Copy contents of edd/other/solr to solr directory
    * Copy contents of ${solr-download}/example/lib/ext to Tomcat lib (/usr/local/tomcat/lib)

  * Configure tomcat:
    * Remove /usr/local/tomcat/webapp/ROOT
    * Add /usr/local/tomcat/conf/Catalina/localhost/ROOT.xml with content (replace version number as needed):
      <?xml version="1.0" encoding="utf-8"?>
      <Context path="" docBase="/usr/local/solr-4.9.0/dist/solr-4.9.0.war" debug="0" reloadable="true"/>
    * Add /usr/local/tomcat/bin/setenv.sh and chmod +x with content:
      #!/bin/bash
      JAVA_OPTS="$JAVA_OPTS -Dsolr.solr.home=/usr/local/var/solr"
    * Change server.xml to listen only on localhost:
      <Connector address="localhost" port="8080" ...

  * Start Tomcat:
    * `catalina start`

  * Access Solr Admin web interface @ http://localhost:8080/
    * Lets you poke at various internals and confirm that the index is working
    * Note that if you get a blank page here you may be running a version of the Java VM that is too old to include the websocket functionality by default.  (OS X 10.7, for example, has the 1.6 VM which is too old.)  To fix this, download and install a more recent version of the JDK from:
    http://www.oracle.com/technetwork/java/javase/downloads/index.html

TODO: how to install homebrew
TODO: instructions on setting up server.cfg + template for server.cfg
TODO: walkthrough on a clean mac 
