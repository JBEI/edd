# Postgres supplementary files

This directory contains supplementary files to assist in [EDD][1] use of the
[PostgreSQL][2] database. Files under the `initdb` directory are executed when
the PostgreSQL container launches with a fresh data volume.

## 000_utilities.sh

This BASH script exports utility functions for use by other scripts in the directory.

## 100_init.sql

This SQL script handles first-time initialization of a database for use by EDD.
It adds database extensions for `HSTORE` and `UUID` data types, and creates
`edd` database for use by the EDD application.

## healthcheck.sh

A simple healthcheck script that verifies that the database server is up and
responding to query requests.

---

[1]: ../../README.md
[2]: https://www.postgresql.org/
