# Configuring EDD

This page gives an overview of the most useful configuration options built into EDD. There are
several sources of configuration available and some are described in further detail in sections
below. Broadly speaking, each of the Docker containers used by EDD has its own configuration(s),
as well as several configuration files for Docker itself. See comments within each file for a
detailed description of some of the options.

1. __Docker-compose environment variables__: provide basic controls for loading EDD's database from
  an existing dump, or for controlling TLS and Docker configuration for controlling remote EDD
  deployments.
2. __Docker configuration files__
  These files configure EDD's docker containers and enable you to launch EDD and most of its
  dependencies with a single command.
    * `secrets.env`: Stores passwords and URL's for the various services EDD has to connect to,
      and makes them accessible to EDD's Docker containers. Make sure to control access to this
      file! The file will potentially contain secrets for external services, and should be
      protected like any other password file. The repository excludes this file, but includes a
      `secrets.env-example` to use as a template.
    * `docker-compose.yml`: Configures EDD's docker containers as run by Docker-compose. This is
      set up by default in a working configuration, but you may want to change container
      definitions, etc. based on your computing needs / resources and deployment strategy. See the
      [Docker-compose documentation][1] for reference. Most local changes should go in the
      `docker-compose.override.yml` file. The override file is not included in the repository, like
      `secrets.env`, but there is an `docker-compose.yml-example` used to generate one. See
      comments in the example file, and the related
      [Docker-compose extends documentation][2] for reference.
3. __EDD appserver configuration files__: The vast majority of EDD's code runs in Django, and can
  be configured by overriding the default settings provided with EDD. See "EDD Appserver
  Configuration Files" below for more details.
4. __Other service-specific scripts and configurations files__ are available by directories
  matching each service name under `docker_services`. Drill down into these directories to find
  service-specific configurations.


## EDD Appserver Configuration Files

The vast majority of EDD's code runs in Django, and many of its configuration options are also
provided out-of-the-box by Django or Django-related libraries. In the style of Django, EDD includes
a number of default Python configuration files, as well as examples that are set up to make
configuration more-or-less hassle free. Most of the contained configuration parameters are defined
by Django in its [documentation][3], but several are custom configuration options defined by EDD.

EDD's Django configuration files live under `edd/settings`:
* `base.py`: defines baseline default settings that make EDD work out-of-the box. You can edit
  this file directly, but it's cleaner / easier in the long run to override its values by creating
  a `local.py`. See below for more details.
* `local.py`: sample file is provided out-of-the-box with EDD. EDD checks for its existence, and
  any configuration options you define in `local.py` will override the defaults defined in
  `base.py`. You can copy and edit 'local.py-example' to override any options you want from
  `base.py`. Note  that `local.py` is purposefully *not* added to EDD's Git repo, since its
  purpose is to define options specific to a single EDD deployment. As a result, you can update
  your EDD deployment with a simple `git pull`, followed by a relaunch.
* `celery.py`: Defines EDD's Celery configuration. EDD ships with some reasonable default settings,
  but you may have to tune Celery to work with your computing environment/demands. See Celery's
  [configuration documentation][4], as well as EDD's custom Celery configuration options defined
  in the file. Values defined here can also be overridden in your `local.py`.
* `auth.py`: Defines authentication-specific settings that can be overridden in your `local.py`


## Configuring Social Logins <a name="Social"/>

* For broad overview, refer to the [django-allauth documentation][5].
* To use a new provider:
    * Add the provider application to `INSTALLED_APPS`
    * Put logos in `./main/static/main/images/` and update styles in `./main/static/main/login.css`
* From the admin site, add a new Social application, using Client ID and Secret Key from provider
    * [Github registration][6]
    * [Google registration][7]
    * [LinkedIn registration][8]
* Each provider may require additional details about the application, allowed domains and/or
  URLs, etc.


## Using an External Postgres Server

You may want to use an external postgres server instead of the Postgres Docker container configured
in EDD's default `docker-compose.yml`. If so, you'll want to follow this general outline:

* Manually run similar commands to those in `docker_services/postgres/init.sql`, to create
  databases and roles for user and celery data.
* Update secrets.env with the correct database URLs for both edd and celery databases.
* Change the service definition for `postgres` in your `docker-compose.override.yml` file. The
  container will still start, but overhead can be reduced by:
    * Changing the `image` to `edd-core`; eliminating the need to download the `postgres` image.
    * Changing the `entrypoint` to `true`; causing the container to immediately exit.

---------------------------------------------------------------------------------------------------

[1]:    https://docs.docker.com/compose/overview/
[2]:    https://docs.docker.com/compose/extends/#/understanding-multiple-compose-files
[3]:    https://docs.djangoproject.com/en/1.9/topics/settings/
[4]:    http://docs.celeryproject.org/en/latest/configuration.html
[5]:    http://django-allauth.readthedocs.org/en/latest/index.html
[6]:    https://github.com/settings/applications/new
[7]:    https://console.developers.google.com/
[8]:    https://www.linkedin.com/secure/developer?newapp=
