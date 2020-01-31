## Migrating EDD from 2.5.x to 2.6.0+

The 2.6.0 version intentionally breaks compatibility with Docker Compose files
of previous versions. One of the major features of 2.6.0 is the ability to only
launch services in Docker that do not have external providers. This feature is
meaningless if continuing to use a `docker-compose.override.yml` based on the
example from previous versions.

### Changing Files

Some files are either deprecated, or will be updated in an incompatible way.
To ensure that any changes can be applied to the new version of EDD, make
reference copies of the following files:

-   `server/edd/settings/local.py`
-   `secrets/secrets.env`
-   `docker-compose.override.yml`

Each of these files may contain values that should get moved to:

-   `settings/__init__.py` or another Python file in `settings/`
-   a per-service `.env` file in `secrets`
-   the updated and auto-generated `docker-compose.override.yml`

### Volumes

Should volumes require renaming, make use of the scripts
`./bin/backup_volume.sh` and `./bin/restore_volume.sh`. Alternatively, change
the `volumes` key in `docker-compose.override.yml` to reference the old
volume name.
