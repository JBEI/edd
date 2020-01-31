## Compose File Fragments

This directory contains fragments of files for orchestrating EDD with Docker
Compose. When the files are merged together, the result is a configuration file
enabling the selected services.

### Use Cases

1. Launch EDD primary services only (http, websocket, celery)

    This requires passing in connection information for ICE, postgres, rabbitmq,
    redis, smtp, _and_ solr. If any are missing, cannot proceed.

2. Same as 1, plus any combination of bundled individual services:

    - postgres
    - rabbitmq
    - redis
    - smtp
    - solr

    Any service not bundled _must_ have connection information provided, same
    as above in 1.

3. Same as 1 or 2, plus an Nginx proxy on a localhost domain

    The localhost domains used are `*.lvh.me`, a DNS record that points to
    `127.0.0.1` (a.k.a. `localhost`). So the EDD application is accessed via
    `edd.lvh.me`. If the bundled services are enabled, then the RabbitMQ
    management interface is available at `rabbitmq.lvh.me`, and Solr Admin
    at `solr.lvh.me`.

4. Same as 3, but with a bundled ICE accessed via proxy

    Using a bundled ICE instance is mutually exclusive to using a public domain
    and requires the use of the bundled Nginx proxy from 3. The bundled ICE is
    only feasible for a testing deployment, thus anything on a public domain
    should be configured to use a separately deployed ICE.

5. Same as 3, but on a public domain with Let's Encrypt adding TLS

    Using a public domain with the bundled Nginx proxy requires setting up
    Let's Encrypt to get TLS certificates. When doing this, the management
    interfaces for `rabbitmq` and `solr` will _not_ be proxied.

### Workflow

Script launches a configuration container. Container can run in modes for
offline (no interaction, for e.g. Jenkins), online (starts simple webapp
walking through setup), or interactive (does webapp setup tasks by prompting
via terminal). The configuration container will take an install directory and
handle setup for secrets directory and the docker-compose.override.yml file.
Setup involves getting and validating connection parameters for services, or
selecting to use a bundled service.
