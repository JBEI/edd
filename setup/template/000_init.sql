-- these are temporary, throw-away passwords
-- do not use anywhere outside of temporary development databases
-- rotate out in `http.env`
-- NOTE: edduser gets CREATEDB so tests can create `test_edd` database
CREATE USER edduser WITH CREATEDB PASSWORD '{db_password}';

-- install extensions in template1 database
\c template1
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;
COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';
CREATE EXTENSION IF NOT EXISTS hstore WITH SCHEMA public;
COMMENT ON EXTENSION hstore IS 'data type for storing sets of (key, value) pairs';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

CREATE DATABASE edd;
GRANT ALL PRIVILEGES ON DATABASE edd TO edduser;
COMMENT ON DATABASE edd IS 'Testing database for EDD';
