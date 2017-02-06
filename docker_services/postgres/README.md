# Postgres supplementary files

This directory contains two supplementary files to assist in [EDD][1] use of the [PostgreSQL][2]
database.

## init.sql

This SQL script handles first-time initialization of a database for use by EDD. The database
initialization step of the [edd-core][3] image will test for the existence of an `edd` database
at the configured database server. If that database is missing, this initialization script will
create the users, extensions and databases used by EDD.

## healthcheck.sh

A simple healthcheck script that verifies that the database server is up and responding to query
requests.

---------------------------------------------------------------------------------------------------

[1]:    ../../README.md
[2]:    https://www.postgresql.org/
[3]:    ../edd/README.md
