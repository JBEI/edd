## Release Process

This document is an outline of the steps that should be taken to make a new release of EDD. Where
possible, these steps should be automated.

### Operations in `git` repository

For Major (N+1.0.0) or Minor (X.N+1.0) versions, create a date-stamped release
branch from `trunk` for the release-candidate. For example, if starting a
4.0.0 release series on July 1st, 2019; a branch named `release/20190701` is
started from `trunk`. Commits working toward a final release artifact get
added to this branch.

For Bugfix (X.Y.N+1) versions, add commits to the Major/Minor release branch.
The exact commit used to create a final release artifact is to be tagged with
the X.Y.Z version number for the released artifact. Multiple commits may exist
between bugfix version tags.

### Operations to build release artifacts

Notes on flags to `docker build` commands:

-   `--pull` makes sure to pull the latest version of the base image from
    Docker Hub
-   `--no-cache` makes sure to build from scratch, without build cache
-   `-t [NAME]` tags the resulting image; otherwise image is only accessible
    from its hash ID

Build the Docker image for `jbei/edd-node` in `${BASE}/docker/node/` directory.
This image is responsible for the TypeScript build environment and creates the
static script and stylesheet assets for EDD. The below command builds and tags
the image with `latest` and the `X.Y.Z` version:

    docker build \
        --pull \
        --no-cache \
        -t jbei/edd-node \
        -t jbei/edd-node:X.Y.Z \
        .

Build the Docker image for `jbei/scikit-learn` in
`${BASE}/docker/edd/scikit-learn` directory. This image is the base Python with
Numpy, SciPy, Scikit-learn environment, that would otherwise take too long to
build every time. This image should remain stable for longer periods. Release
schedule is TBD, see README in the directory. The below command builds and tags
the image:

    docker build \
        --pull \
        --no-cache \
        -t jbei/scikit-learn \
        .

Build the Docker image for `jbei/edd-core` directly in the `${BASE}` directory.
Make sure to locally build `jbei/edd-node` and `jbei/scikit-learn` first. The
below command builds and tags the image with `latest` and the `X.Y.Z` version:

    DOCKER_BUILDKIT=1 docker build \
        -t jbei/edd-core \
        -t jbei/edd-core:X.Y.Z \
        -f docker/edd/core/Dockerfile \
        --build-arg "TARGET=prod" \
        --build-arg "EDD_VERSION=X.Y.Z" \
        .

For other Docker images under `${BASE}/docker/` directory, services should be
tagged with the upstream service version. For example, custom build of
Postgres 9.6 would get tagged `jbei/postgres:9.6`. Also tag custom builds of
services with the ISO date of the build. For example, a build on July 1st, 2019
of Postgres 9.6 would get tagged `jbei/postgres:9.6-20190701`.

### Deploying Releases

Push images to Docker Hub with `docker push [IMAGENAME]`. On the deploy host,
Pull images from Docker Hub with `docker pull [IMAGENAME]`. Checkout or pull
updated code/configs from `git`. For smallest downtime, use
`docker-compose up -d` to detect containers that need to be re-created, and
automatically stop, remove, and re-create them.
