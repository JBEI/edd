import invoke

from . import util


@invoke.task
def environment(context):
    """
    Checks that expected environment variables are set.

    If an environment variable is not found, an exception is thrown and
    execution aborts.
    """
    # attempting to load environment not set will raise exception
    util.env("BROKER_URL")
    util.env("CACHE_URL")
    util.env("DATABASE_URL")
    util.env("EDD_EMAIL")
    util.env("EDD_USER")


@invoke.task
def code(context):
    """
    Checks that code is in place for execution.

    Checks that either code to execute is mounted to a volume
    or copies the Docker image code there.
    """
    mounted_code = util.env("EDD_CODE", default="/code")
    mounted_settings = util.env("EDD_SETTINGS", default="/etc/edd")
    container_code = "/usr/local/edd"
    runtime_code = "/code"
    # Django manage.py is a proxy for the rest of the code being present
    if context.run(f"test -x {runtime_code}/manage.py", warn=True).ok:
        print("Running with mounted copy of code …")
    elif context.run(f"test -x {mounted_code}/manage.py", warn=True).ok:
        print(f"Running with code mounted at {mounted_code} …")
        with context.cd(runtime_code):
            context.run(f"cp -R {mounted_code}/. .")
    else:
        print("Running with container copy of code …")
        with context.cd(runtime_code):
            context.run(f"cp -R {container_code}/. .")
    if context.run(f"test -r {mounted_settings}").ok:
        print(f"Loading settings from {mounted_settings} …")
        with context.cd(f"{runtime_code}/edd/settings"):
            context.run(f"mkdir -p local")
            context.run(f"cp -R {mounted_settings}/. ./local")


@invoke.task(pre=[environment])
def redis(context, limit=10):
    """Waits for the Redis service to begin responding to connections."""
    util.retry(util.is_redis_available, limit=limit)


# staticfiles: Check if static files need copying to volume;
@invoke.task(pre=[redis])
def staticfiles(context):
    """
    Initializes static assets.

    Checks that staticfiles for this image version are copied to the volume
    storing static assets for the webserver.
    """
    # this is touching things that are shared between containers
    # must grab a lock before proceeding
    cache = util.get_redis()
    # assume copy succeeds unless proven otherwise below
    copied = True
    with cache.lock(b"edd.startup.staticfiles"):
        try:
            version_hash = util.get_version_hash(context)
            manifest = f"/var/www/static/staticfiles.{version_hash}.json"
            result = context.run(f"test -f '{manifest}'", warn=True)
            if not result.ok:
                print(f"Copying staticfiles for manifest {version_hash}")
                copied = context.run(
                    "cp -R /usr/local/edd-static/. /var/www/static/", warn=True
                ).ok
            else:
                print("Found staticfiles OK")
        except BaseException:
            # NOTE: dangerous using BaseException;
            # do not copy this pattern elsewhere
            # unless you know EXACTLY what this is doing
            copied = False
    if not copied:
        raise invoke.exceptions.Exit("Staticfiles check failed")


# postgres: Wait for postgres service to begin responding to connections;
@invoke.task(pre=[environment])
def postgres(context, limit=10):
    """Waits for the Postgres service to begin responding to connections."""
    util.retry(util.is_postgres_available, limit=limit)


# solr: Wait for solr service to begin responding to connections;
@invoke.task(pre=[environment])
def solr(context, limit=10):
    """Waits for the Solr service to begin responding to connections."""
    util.retry(util.is_solr_available, limit=limit)


# solr_ready: verifies that search index collections are ready
@invoke.task(pre=[code, redis, solr])
def solr_ready(context):
    # this is touching things that are shared between containers
    # must grab a lock before proceeding
    cache = util.get_redis()
    ready = True
    with cache.lock(b"edd.startup.indexcheck"):
        try:
            ready = context.run("/code/manage.py edd_index --check", warn=True).ok
        except BaseException:
            # NOTE: dangerous using BaseException;
            # do not copy this pattern elsewhere
            # unless you know EXACTLY what this is doing
            ready = False
    if not ready:
        raise invoke.exceptions.Exit("Index check failed")


# migrations: Run migrations
@invoke.task(pre=[code, redis, postgres, solr_ready])
def migrations(context):
    """
    Migrates the database to the current version.

    Brings the database and search index into operational mode by running
    Django migrations and running a re-index task. Protected by a mutex
    so only one image per version will run.
    """
    version_hash = util.get_version_hash(context)
    # this is touching things that are shared between containers
    # must grab a lock before proceeding
    cache = util.get_redis()
    prefix = "edd.startup.migrations"
    version_key = f"{prefix}.{version_hash}".encode("utf-8")
    # assume things current unless explicitly shown otherwise below
    current = True
    with cache.lock(prefix.encode("utf-8")):
        try:
            # check if another image recently ran check for this version
            if not cache.get(version_key):
                # checks for any pending migrations
                if util.get_pending_migrations(context):
                    # run pending migrations, set current to success value
                    current = context.run("/code/manage.py migrate", warn=True).ok
                    # clean Solr indices
                    context.run("/code/manage.py edd_index --clean", warn=True)
                    # force re-index in the background
                    context.run("/code/manage.py edd_index --force &", disown=True)
                else:
                    # re-index in the background
                    context.run("/code/manage.py edd_index &", disown=True)
            # mark this version as recently checked
            # expire in a week
            # avoids cost of checking every time
            # avoids keeping list of every hash run forever
            expires = 60 * 60 * 24 * 7
            cache.set(version_key, version_hash.encode("utf-8"), ex=expires)
        except BaseException:
            # NOTE: dangerous using BaseException;
            # do not copy this pattern elsewhere
            # unless you know EXACTLY what this is doing
            current = False
    if not current:
        raise invoke.exceptions.Exit("Migration check failed")


# errorpage: Render static 500.html error page
@invoke.task(pre=[migrations, staticfiles])
def errorpage(context):
    """Renders a static version of the Django error page."""
    # check if the 500.html page exists in *this* container
    error_html = "/code/main/templates/500.html"
    result = context.run(f"test -r '{error_html}'", warn=True)
    if not result.ok:
        # render 500.html with the current database state
        print("Rendering 500.html error page …")
        context.run("/code/manage.py edd_render_error")
    else:
        # check that it has the right version
        version_hash = util.get_version_hash(context)
        version_number = util.env("EDD_VERSION", default="unversioned")
        result = context.run(
            fr"grep -E '\({version_hash}\)' '{error_html}'", warn=True, hide=True
        )
        # pull out the version string from grep
        # e.g. "Experiment Data Depot 1.2.3 (abcdef)"
        found_version = result.stdout.strip()
        if version_number not in found_version:
            context.run("/code/manage.py edd_render_error")
    # TODO with mutex, put error page in NGINX so 503 errors have correct branding


# rabbitmq: Wait for rabbitmq service to begin responding to connections
@invoke.task(pre=[environment])
def rabbitmq(context, limit=10):
    """Waits for the RabbitMQ service to begin responding to connections."""
    util.retry(util.is_rabbitmq_available, limit=limit)


# owner: Set container directory ownership to edduser
@invoke.task(pre=[code, staticfiles])
def owner(context):
    """
    Sets ownership on necessary directories.
    """
    dirs = [
        # container copy of code
        "/usr/local/edd",
        # container log directory
        "/var/log/edd",
        # volume mount for static assets
        "/var/www/static",
        # volume mount for uploaded files
        "/var/www/uploads",
    ]
    for directory in dirs:
        util.ensure_dir_owner(context, directory)
