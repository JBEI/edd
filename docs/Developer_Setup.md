# Developer Setup

This document describes how to get a development environment configured for
modifying or contributing to EDD. This page is assuming that typical
development tools (like `git`) and specific tools used by EDD (like `docker`
and `pre-commit`) are installed already. If they are not installed, there
are separate guides for [macOS][5] and [Linux][6] pre-requisites.

### Clone the repo

It would be difficult to start developing on EDD without the code! So step 1:

```bash
git clone https://github.com/JBEI/edd.git
```

### Install pre-commit hooks

We are using [`pre-commit`][4] to do some basic sanity checks on code. This
tool runs various linters and checks on every commit, and makes sure that code
is up to some minimum standards at all times. This only needs to be run once
per clone:

```bash
pre-commit install
```

### Configure

EDD includes a script to handle creating basic initial configuration. This
script will:

-   Test your git configuration
-   Copy sample configuration files
-   Generate random passwords for use in autoconfiguring EDD's Docker services

See the documentation inside `docker/edd/config` for more information. For
development, you will most likely want to run the command as:

```bash
./bin/init-config offline --deploy=dev
```

#### Configure `settings`

While optional, this step is highly recommended, if only to enable features
like emailing yourself when errors occur, or making use of Django `DEBUG`
features and the Django Debug Toolbar. Copy the file `settings/example` to
`settings/__init__.py`, and make edits there.

Some additional changes to aid in development can be made by changing the
Django settings. Add support for the [Django debug toolbar][3] in the settings
directory to run EDD with a helpful debug application. This will add an
expandable toolbar to every page, showing information like request headers, SQL
queries run, template context, signals fired, etc.

#### Configure `secrets`

The `init-config` script will create a `secrets` directory, containing
generated passwords and connection URLs for services. These passwords are set
in the service data volumes on first launch; to use alternate passwords or
existing services (e.g. if you already have a Postgres cluster), edit the file
prior to launching EDD.

### Pull EDD's images

Running `docker compose up` will automatically pull any missing Docker images
to the host prior to launching; however, it is sometimes useful to run this
step manually. Building or pulling specific images, and tagging appropriately,
allows more control over the images used to launch EDD.

### Launch EDD

You can run EDD either on a single Docker node with `docker compose up -d`, or
use a Docker Swarm with `docker stack deploy -c [CONFIG] [STACK]`. Create a
config file by running `docker compose config` and saving the output.

### Install ICE

Running `bin/init-config` with `offline --deploy=dev` will configure EDD to
launch with an ICE instance appropriate for local-only testing. An external
instance may also be configured by creating a random key like so:

```bash
openssl rand -base64 64 | tr -d '\n' > secrets/edd_ice_key
```

Then copy this shared secret to both the target ICE instance and EDD.

### Front-end Development

The EDD makes use of Node.js packages for managing front-end code. All dev
dependencies are contained in a Docker image, available under the tag
`jbei/edd-node` on Docker Hub. It is used as part of the build of the
`jbei/edd-core` image, to prepare front-end assets.

EDD uses [TypeScript][1] for its client-side interface, and compiles JavaScript
with third-party libraries using [Webpack][2]. The static asset files for the
frontend are bundled with the `jbei/edd-core` image; however, running a full
Docker build following any change to the TypeScript code, will be inefficient.
To avoid this, follow these configuration steps to get changed TypeScript
deployed to a running EDD without a full build.

#### Launch EDD

This will typically be `docker compose up -d`, or `docker stack deploy`. The
compose file used to launch should have an override to load code in from the
host to a volume mounted at `/code`. This should already be in place when using
the `--deploy=dev` flag to `bin/init-config`.

#### Edit and Compile Typescript

Use the `bin/local_typescript_shell.sh` script to launch a container for the
EDD TypeScript environment. Inside the TypeScript container shell, execute
`yarn local` to do a one-time local build, or `yarn watch` to monitor
changes and run incremental builds on save.

#### Refresh static files in EDD

Once static files are compiled, use the `refresh_static.sh` command in an EDD
container built in dev mode. This command will copy any changed static files so
they can be served, and update the internal Django settings used by EDD to
identify the currently active static files.

---

[1]: http://typescriptlang.org/
[2]: https://webpack.js.org/
[3]: https://django-debug-toolbar.readthedocs.io/en/stable/
[4]: https://pre-commit.com/
[5]: Developer_Setup_Mac.md
[6]: Developer_Setup_Linux.md
