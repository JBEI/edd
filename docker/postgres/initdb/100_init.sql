-- Load a password from the environment, or use default value 'jbei'
\set edd_pgpass `echo "${EDD_PGPASS:-jbei}"`
-- Create edduser with environment password
CREATE USER edduser WITH PASSWORD :'edd_pgpass'
    NOSUPERUSER INHERIT CREATEDB NOCREATEROLE NOREPLICATION;
-- Create the database for EDD; will have hstore/uuid since template already created it
CREATE DATABASE edd;
-- Ensure edduser role can access edd database
GRANT ALL PRIVILEGES ON DATABASE edd TO edduser;
