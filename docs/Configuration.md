# Configuring EDD

This page gives an overview of the most useful configuration options built into EDD. There are
several sources of configuration available and some are described in further detail in sections
below. Broadly speaking, each of the Docker containers used by EDD has its own configuration(s),
as well as several configuration files for Docker itself. See comments within each file for a
detailed description of some of the options.

-   **Docker configuration files**
    These files configure EDD's docker containers and enable you to launch EDD and most of its
    dependencies with a single command.

    -   `secrets`: Directory stores passwords and URL's for the various
        services EDD has to connect to, and makes them accessible to EDD's
        Docker containers. Make sure to control access to this directory! It is
        meant to contain secrets for external services, and should be protected
        as any other password file. The `.gitignore` should exclude
        this directory.
    -   `settings`: Directory stores Django settings value overrides. It is
        treated as a Python module, located at `edd.settings.local`. The
        default `edd.settings` attempts to `from .local import *`, allowing
        values in the module to override any setting attributes. The
        `.gitignore` should exclude this directory.
    -   `docker-compose.yml`: Configures EDD's docker containers as run by
        Docker Compose. This is set up in a working configuration with basic
        default settings, but you may wish to change container definitions,
        etc. based on your computing needs, available resources, and deployment
        strategy. See the [Docker-compose documentation][1] for reference. Most
        local changes should go in the `docker-compose.override.yml` file. The
        override file is not included in the repository, but can be
        automatically generated by `./bin/init-config`. See the related
        [Docker-compose extends documentation][2] for reference.

-   **EDD Django configuration files**: Much of EDD's functionality runs through the Django
    framework, and can be configured using Django's settings mechanism. See "EDD Django
    Configuration Files" below for more details.

-   **Service-specific scripts and configuration**: The full definitions of services and
    configurations used in EDD are contained in the `docker` directory. Each service can be
    configured per the documentation provided by the maintainer of the used image, or a different
    image can be used. Links to the documentation for EDD service images are provided here
    for reference:
    -   [postgres][9]
    -   [redis][10]
    -   [solr][11]
    -   [rabbitmq][12]
    -   [nginx][13]

## EDD Django Configuration Files

As a Django application, EDD loads its configuration with Python code. EDD's
settings are designed to load in default values, while allowing for overrides
with a `local.py` settings file. An example of this file can be found at
`server/edd/settings/local.py-example`. Custom settings are loaded with a
`volume` definition targeting `/code/edd/settings` in each of the `http`,
`worker`, and `websocket` services.

Most of the available configuration parameters are defined by Django in its [documentation][3], or
by Celery in its [configuration documentation][4]. The settings for non-core Django applications
used by EDD can be found with each individual project:

-   [django_extensions][14]
-   [rest_framework][15]
-   [form_utils][16]
-   [messages_extends][17]
-   [django-allauth][5]

The defaults used by EDD are defined in the following files found under `server/edd/settings`:

-   `base.py`: defines baseline default settings that make EDD work out-of-the box.
-   `celery.py`: Defines EDD's Celery-specific configuration.
-   `edd.py`: Defines custom settings for EDD itself
-   `auth.py`: Defines authentication-specific settings.

Settings unique to EDD will generally be prefixed with `EDD_`. Commentary for each of these,
including possible values, should be included in the `local.py-example` file. See "Custom
Python Configuration" under [Deployment][18] for specific examples.

### Configuring Social Logins <a name="Social"/>

-   For broad overview, refer to the [django-allauth documentation][5].
-   To use a new provider:
    -   Add the provider application to `INSTALLED_APPS`
    -   Put logos in `./main/static/main/images/` and update styles
        in `./main/static/main/login.css`
-   From the admin site, add a new Social application, using Client ID and Secret Key from provider
    -   [Github registration][6]
    -   [Google registration][7]
    -   [LinkedIn registration][8]
-   Each provider may require additional details about the application, allowed domains and/or
    URLs, etc.

### Using External Services

You may want to use a external services, instead of using the containers
bundled in EDD's generated `docker-compose.override.yml`. If so, you'll want to
follow this general outline:

-   For databases, manually run similar commands to those in
    `bin/postgres/000_init.sql`, to create databases and roles.
-   Run `bin/init-config` with the connection string to the service.

---

[1]: https://docs.docker.com/compose/overview/
[2]: https://docs.docker.com/compose/extends/#/understanding-multiple-compose-files
[3]: https://docs.djangoproject.com/en/1.9/topics/settings/
[4]: http://docs.celeryproject.org/en/latest/configuration.html
[5]: http://django-allauth.readthedocs.org/en/latest/index.html
[6]: https://github.com/settings/applications/new
[7]: https://console.developers.google.com/
[8]: https://www.linkedin.com/secure/developer?newapp=
[9]: https://hub.docker.com/_/postgres/
[10]: https://hub.docker.com/_/redis/
[11]: https://hub.docker.com/_/solr/
[12]: https://hub.docker.com/_/rabbitmq/
[13]: https://hub.docker.com/_/nginx/
[14]: https://django-extensions.readthedocs.io/en/latest/
[15]: http://www.django-rest-framework.org/
[16]: https://bitbucket.org/carljm/django-form-utils/
[17]: https://github.com/AliLozano/django-messages-extends/
[18]: Deployment.md#Python_Config
