# Deploying EDD

## Pre-requisites

Have [Docker][1] and [Docker Compose][2] installed on the target host. Also have the contents of
the `docker_services` directory of the EDD codebase copied to the target host.

## Building EDD

Before starting a deployment, it is necessary to "build" the images used to create the various
Docker containers. This can be accomplished either by pulling already-built images from a Docker
Registry, or running the `docker-compose build` command to create images from the
included `Dockerfile`s.

## Initial configuration

There are many configuration options that can be set before launching EDD. The `init-config.sh`
script handles creating two files based on included example files:

  * __`secrets.env`__: Contains environment variables loaded into containers at launch; these
    values will generally be passwords, keys, and other secret information.
  * __`docker-compose.override.yml`__: Overrides the default configuration used to launch the
    Docker containers. Non-secret environment, and other launch options will be put into this file.

More information and examples can be found in the example files, and copied into the files created
by the `init-config.sh` script.

TODO:
  * TLS configuration
  * `local.py`
  * EDD `entrypoint.sh` options

## Starting EDD

Once configured, EDD is launched with a simple command, `docker-compose up -d`. To stop EDD, run
`docker-compose down`.

---------------------------------------------------------------------------------------------------

[1]:    https://docker.io/
[2]:    https://docs.docker.com/compose/overview/
