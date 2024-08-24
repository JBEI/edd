-- these are temporary, throw-away passwords
-- do not use anywhere outside of temporary development databases
-- rotate out in `ice.env`
CREATE USER iceuser WITH PASSWORD '{db_password}';

CREATE DATABASE ice;
GRANT ALL PRIVILEGES ON DATABASE ice TO iceuser;
COMMENT ON DATABASE ice IS 'Testing database for EDD';
