# Developer Setup

This document describes how to get a development environment configured for modifying or
contributing to EDD.

## Contents

-   [Mac OS Setup](#MacOS_Setup)
    -   [XCode](#XCode)
    -   [HomeBrew](#HomeBrew)
    -   [Docker](#Docker)
-   [Linux / Debian](#Debian)
-   [Common Setup Tasks](#Common)
-   [Front-end Development](#Frontend)
-   [Running EDD](#Running_EDD)

---

### Mac OS Setup <a name="MacOS_Setup">¶</a>

This section contains directions for setting up a development environment for EDD on Mac OS.

#### XCode <a name="XCode">¶</a>

Macs have tools for development freely available, but these tools are not installed by default. To
ensure the necessary utilities are installed, get XCode from the App Store. After launching the
XCode app, you should be prompted to install additional components. As of OS X 10.9 "Mavericks"
or later, and macOS 10.12 "Sierra" or later, the utilites used by EDD can be installed by running
`xcode-select --install` from the Terminal.

##### Homebrew <a name="HomeBrew">¶</a>

[Homebrew][1] is a package manager for OS X. The Homebrew packages handle installation and
dependency management for Terminal software. The Caskroom extension to Homebrew does the same
for GUI applications. There is a `Brewfile` in the root of the EDD repository that defines the
software used for EDD development.

To install, run the below command in Terminal, and follow the prompts.

    ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

After installing Homebrew, the `brew` command will be available to run in Terminal. Running
`brew doctor` should say `Your system is ready to brew.` or describe any problems with the
install. From the edd root directory, `brew bundle` should install software defined in
the `Brewfile`.

It is a good idea to occaisionally run `brew update` to refresh Homebrew's list of available
packages and versions; and run `brew upgrade` to install updated versions of your installed
Homebrew packages.

#### Docker <a name="Docker">¶</a>

[Docker][2] is a container virtualization platform: all software, configuration, and
dependencies required to run a service are packaged into standalone images. These images are
ready to run immediately upon being copied to a new host running a Docker daemon. Docker is
installed with the `Brewfile` in the previous section.

Verify that Docker is installed and setup correctly by running: `docker run --rm hello-world`.
If you get `docker: command not found`, that means Docker was not successfully installed from
Homebrew. Try getting the Docker for Mac installer directly from the Docker project. The related
`docker-compose` utility manages launching multiple services in multiple containers, based on a
configuration file. Running the `docker-compose` command should display some help text describing
the options for using the tool. If you do not see this help, try re-installing Docker for Mac.

Resources available for Docker containers are set in the Docker menu Preferences, under the
Advanced tab. It is recommended to allocate at least 2 CPU cores and 4 GB RAM to Docker. Click
the `Apply & Restart` button to restart Docker with updated resource allocations.

#### Next Steps

Complete [Common Setup Tasks](#Common) below to get an EDD development environment configured and
running for the first time. The "Front-end Development" section has a few additional
recommendations to ease development and debugging.

### Linux / Debian Setup <a name="Debian">¶</a>

This section contains directions for setting up a production deployment for EDD on Debian. Follow
the Docker-recommended instructions for [installing the daemon for your distro][5]. NOTE: there is
a `docker` package in the Debian apt repos. It is not [Docker][2]! There is a `docker.io` package
too; this can work, but the Debian-maintained packages will generally lag behind the official
Docker-maintained packages.

Test that Docker and Docker Compose are installed and running correctly by executing
`docker run --rm hello-world` and `docker-compose`, respectively. If all is well, proceed to
[Common Setup Tasks](#Common).

Install [pre-commit][12], either directly with `pip install pre-commit` in the system Python or
a development-specific virtualenv, or use the non-administrative install script with
`curl https://pre-commit.com/install-local.py | python -`.

### Common Setup Tasks <a name="Common">¶</a>

After you have all of the Docker tools minimally configured for your environment, perform the
following steps to configure EDD and launch it for the first time.

1.  **Clone the repo**: `git clone https://github.com/JBEI/edd.git`

2.  **Install pre-commit hooks**: `pre-commit install`

3.  **Run `bin/init-config`**

    This script will:

    -   Test your git configuration
    -   Copy sample configuration files
    -   Generate random passwords for use in autoconfiguring EDD's Docker services

4.  (_optional_) **Configure `secrets`**

    The `init-config` script will create a `secrets` directory, containing generated passwords and
    connection URLs for services. These passwords are set in the service data volumes on first
    launch; to use alternate passwords or existing services (e.g. if you already have a Postgres
    cluster), edit the file prior to launching EDD.

5.  (_optional_) **Build or Pull EDD's images**

    Running `docker-compose up` will automatically pull any missing Docker images to the host
    prior to launching; however, it is sometimes useful to run this step manually to have more
    control over the images used to launch containers.

    -   Build images from the repository Dockerfiles with `docker-compose build`
    -   Pull pre-built images from Docker Hub with `docker-compose pull`
    -   Tag images with version tags using the `docker tag {src-image} {tag-name}` command

6.  **Launch EDD's services**

    You can run EDD either on a single Docker node with `docker-compose up -d`, or use a Docker
    Swarm with `docker stack deploy -c [CONFIG] [STACK]`. Create a config file by running
    `docker-compose config` and saving the output.

7.  **Install and configure a supporting [ICE][7] deployment**

    The `ice.yml` file included in the repository will create a simple ICE deployment when combined
    with the other Compose YAML files. EDD requires ICE as a reference for strains used in EDD's experiments. You will not be able to reference strains in your EDD studies until EDD can
    successfully communicate and authenticate with ICE.

    Create a HMAC signing key to authenticate communication using a command like:

        openssl rand -base64 64 | tr -d '\n' > secrets/edd_ice_key

### Front-end Development <a name="Frontend">¶</a>

The EDD makes use of Node.js packages for managing front-end code. All dev dependencies are
contained in the root directory of a Docker image, available under the tag `jbei/edd-node` on
Docker Hub. This image has `node` and `npm` installed, with all the packages necessary to build
EDD. It is used as part of the build of the `jbei/edd-core` image, to prepare front-end assets.

EDD uses [TypeScript][4] for its client-side interface, and compiles JavaScript with third-party
libraries using [Webpack][9] during the build process for the `jbei/edd-core` image. Running a
full Docker build, for any change to the TypeScript code, will be inefficient. To avoid this,
follow these configuration steps to get changed TypeScript deployed to a running
EDD automatically.

1.  **Load local copy of EDD code**

    By default, EDD runs from code contained inside the Docker image. To run modified code, add an
    entry to the `services/edd/volumes` setting key in `docker-compose.override.yml` with the full
    path to code on your system. An example of this setting is commented out in the override file
    generated by `./bin/init-config` from step 2 of [Common Setup Tasks](#Common).

2.  **Add `--watch-static` to `command`**

    This flag to the EDD `entrypoint.sh` script will instruct EDD to watch for changes to static
    web assets, and copy changed files to the storage location for the webserver. Without this,
    the Django `python manage.py collectstatic` command would need to run manually after every
    re-build of Webpack. An example is in the `docker-compose.override.yml` under the comment
    tagged with `[DEVMODE]`.

3.  **Launch EDD**

4.  **Run the `jbei/edd-node` image**

    Run the below command to launch a container to watch for TypeScript changes and automatically
    compile them to new dist JavaScript files.

        docker run --rm \
            -v "/full/path/to/repo:/run/edd" \
            jbei/edd-node \
            npm run watch

5.  **Edit TypeScript files**

Some additional changes to aid in development can be made by changing the Django settings. Add
support for the [Django debug toolbar][10] in the sample `local.py` file to run EDD with
a helpful debug application. This will add an expandable toolbar to every page, showing
information like request headers, SQL queries run, template context, signals fired, etc.

---

## Running EDD <a name="#Running_EDD">¶</a>

This section is a quick reference for commonly helpful commands for running / developing EDD. Many
of them use Docker Compose and other related Docker tools that aren't fully documented here.

-   **Docker services**

    `docker-compose` is the recommended tool for controlling EDD services on a single Docker node.
    The `docker-compose.yml` file defines the list of services as top-level entries under the
    `services` line. To run in a Swarm, use `docker stack deploy`.

    For quick reference, the provided services are:

    -   **edd**: WSGI server that runs the EDD webapp
    -   **websocket**: ASGI server that runs asynchronous parts of EDD
    -   **worker**: long-running and background tasks are run here with Celery
    -   **postgres**: provides EDD's database
    -   **redis**: provides the cache back-end for EDD
    -   **solr**: provides a search index for EDD
    -   **rabbitmq**: messaging bus that supports Celery
    -   **smtp**: mail server that supports emails from EDD

    These additional services may be included as well:

    -   **flower**: management / monitoring application for Celery
    -   **nginx**: webserver that proxies clients' HTTP requests to other Docker services
    -   **nginx-gen**: monitors container start/stop events to generate configs for `nginx`
    -   **letsencrypt**: generates TLS certificates for `nginx` through the Let's Encrypt service

    While edd is running, you can also get a list of its services by runnning `docker-compose ps` or
    `docker stack ps [NAME]`. Each container will be listed in the "Name" column of the
    output, with a name generated by Docker.

-   **`docker-compose` commands**

    -   View logs: `docker-compose logs [service]`
    -   See more in the [Docker Compose documentation][8]

-   **`docker stack` and `docker service` commands**

    -   View logs: `docker service logs [service]`
    -   See more in the [Docker Stack documentation][11]

-   **Running multiple copies of EDD**

    If running multiple copies of EDD on one host or Swarm, prefer using the Swarm deployment method
    and give each deployed stack a unique name. To avoid clashing with open ports, launch Nginx
    separately and configure the different EDD instances with different `VIRTUAL_HOST` environments.

-   **Determining the local URL for EDD's web interfaces:**

    If using a Linux host or Docker for Mac, use the hostname `edd.lvh.me`.

    -   **EDD:** `http://edd.lvh.me/`
    -   **EDD's REST API:** `http://edd.lvh.me/rest/` (if enabled)
    -   **EDD's GraphQL API:** `http://edd.lvh.me/graphql/` (if enabled)
    -   **Solr:** `http://solr.lvh.me/` (if configured in `docker-compose.override.yml`)
    -   **Flower:** `http://flower.lvh.me/` (if configured in `docker-compose.override.yml`)
    -   **RabbitMQ Management Plugin:** `http://rabbitmq.lvh.me/` (if configured in
        `docker-compose.override.yml`)

-   **Interfacing with EDD's services from the command line:**
    -   Run commands in **existing** containers with `docker-compose exec $SERVICE $COMMAND`,
        e.g.: `docker-compose exec edd python /code/manage.py shell`
    -   Restart misbehaving services with: `docker-compose restart $SERVICE`

---

[1]: http://brew.sh/
[2]: https://docker.io/
[3]: https://docs.docker.com/machine/overview/
[4]: http://typescriptlang.org/
[5]: https://docs.docker.com/engine/installation/linux/
[6]: docs/Configuration.md
[7]: https://github.com/JBEI/ice/
[8]: https://docs.docker.com/compose/overview/
[9]: https://webpack.js.org/
[10]: https://django-debug-toolbar.readthedocs.io/en/stable/
[11]: https://docs.docker.com/engine/reference/commandline/stack/
[12]: https://pre-commit.com/
