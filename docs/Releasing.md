## Release Process

This document is an outline of the steps that should be taken to make a new release of EDD. Where
possible, these steps should be automated.

* Operations in `git` repository:
    * For Major (N+1.0.0) or Minor (X.N+1.0) versions, create a date-stamped release branch from
      `master` for the release-candidate. For example, if starting a 4.0.0 release series on
      July 1st, 2019: a branch named `release/20190701` is started from `master`. Commits working
      toward a final release artifact get added to this branch.
    * For Bugfix (X.Y.N+1) versions, add commits to the Major/Minor release branch.
    * The exact commit used to create a final release artifact is to be tagged with the X.Y.Z
      version number for the released artifact.

* Operations to build release artifacts:
    * Notes on flags to `docker build` commands:
        * `--pull` makes sure to pull the latest version of the base image from Docker Hub
        * `--no-cache` makes sure to build from scratch
        * `-t [NAME]` tags the resulting image; otherwise image is only accessible from hash ID
    * Docker image for `jbei/edd-node` in `/docker/node/` directory:
        * Run `docker build --pull --no-cache -t jbei/edd-node`
        * Tag the image with: `docker tag jbei/edd-node:latest jbei/edd-node:X.Y.Z`
    * Docker image for `jbei/scikit-learn` in `/docker/edd/scikit-learn` directory:
        * This image should remain stable for longer periods. Release schedule is TBD, see
          README in the directory.
        * Run `docker build --pull --no-cache -t jbei/scikit-learn`
    * Docker image for `jbei/edd-core` in `/docker/edd/core/` directory:
        * Make sure to locally build `jbei/edd-node` and `jbei/scikit-learn` first.
        * Run `docker build --no-cache --build-arg "TARGET=prod" -t jbei/edd-core`
        * Tag the image with: `docker tag jbei/edd-core:latest jbei/edd-core:X.Y.Z`
    * Other Docker images under `/docker/` directory:
        * Custom builds of services should get tagged with the upstream service version. For
          example, custom build of Postgres 9.6 would get tagged `jbei/postgres:9.6`.
        * Also tag custom builds of services with the ISO date of the build. For example, a
          build on July 1st, 2019 of Postgres 9.6 would get tagged `jbei/postgres:9.6-20190701`.

* Deploying releases:
    * Push images to Docker Hub with `docker push [IMAGENAME]`
    * On deploy host:
        * Pull images from Docker Hub with `docker pull [IMAGENAME]`
        * Checkout or pull updated code/configs from `git`
        * For smallest downtime, use `docker-compose up -d` to detect containers that need
          re-created, and automatically stop, remove, and re-create them.
