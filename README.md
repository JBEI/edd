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
 * Refer to documentation in the edd (perl) project for specifics on Solr setup.
 * Tests in this project make use of a `test` core, which will need to be created
    * Create a new data directory (e.g. `/usr/local/var/solr/data/test`)
    * Add new line to `solr.xml` using same studies `instanceDir` and new data directory
