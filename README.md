# Experiment Data Depot

 * The Experiment Data Depot (EDD) is a web-based repository of processed data obtained via
   experimentation.
 * [edd.jbei.org](https://edd.jbei.org).

## Required Packages
 * Django `pip install django`
 * django-auth-ldap `pip install django-auth-ldap`
 * django-registration `pip install django-registration-redux`
 * requests `pip install requests`
 * psycopg2 `pip install psycopg2`

## Helpful Packages
 * django-debug-toolbar `pip install django-debug-toolbar`
    Include 'debug_toolbar' in settings.py INSTALLED_APPS

## Database conversion
 1. pg\_dump -i -h postgres -U edduser -F p -b -v -f edddb.sql edddb 
 2. Create a new schema in the django database, e.g. "CREATE SCHEMA edd\_convert"
 3. Edit the SQL file to prepend the new schema to the SET search\_path line, and replace all instances of "public." with "edd\_convert." (or whatever the schema name is)
 4. psql edddjango < edddb.sql
 5. psql edddjango < convert.sql

