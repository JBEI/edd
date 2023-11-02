import random
import re
import time

import environ
import kombu
import psycopg
import redis
import requests

env = environ.Env()
pg_url = re.compile(r"^(?:psql|pgsql|postgres)://")


class StartupError(Exception):
    pass


def ensure_dir_owner(context, directory):
    exists = context.run(f"test -d '{directory}'", warn=True)
    if exists.ok:
        result = context.run(f"stat -c %U '{directory}'", warn=True, hide=True)
        owner = result.stdout.strip()
        if owner != "edduser":
            context.run(f"chown -R edduser:edduser '{directory}'")


def get_pending_migrations(context):
    # checks for any pending migrations
    result = context.run(
        # print a plan on order to run migrations
        r"/code/manage.py showmigrations --plan 2> /dev/null "
        # migrations already run will start with "[X]"
        # filter them out
        r"| grep -Ev '^\[X\]'",
        # don't throw exception if the return code is non-zero
        warn=True,
        # don't echo subprocess output
        hide=True,
    )
    pending = result.stdout.strip()
    return pending


def get_postgres():
    url = env("DATABASE_URL")
    # Django Environ accepts psql:// pgsql:// postgres:// postgresql://
    # but psycopg only accepts postgresql://
    url = pg_url.sub("postgresql://", url)
    return psycopg.connect(url)


def get_rabbitmq():
    return kombu.Connection(env("BROKER_URL"))


def get_redis():
    return redis.StrictRedis.from_url(env.cache_url()["LOCATION"])


def get_version_hash(context):
    return context.run("cat /edd.hash", hide=True).stdout.strip()


def is_ice_available():
    try:
        if url := env("ICE_URL", default=False):
            response = requests.get(url)
            response.raise_for_status()
            return response.status_code < 400
        return True
    except Exception as e:
        print(f"Connection to ICE failed with {e}")
    return False


def is_postgres_available():
    try:
        with get_postgres() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            return cursor.fetchone() == (1,)
    except Exception as e:
        print(f"Connection to postgres failed with {e}")
    return False


def is_rabbitmq_available():
    try:
        with get_rabbitmq() as connection:
            connection.connect()
            return connection.connected
    except Exception as e:
        print(f"Connection to rabbitmq failed with {e}")
    return False


def is_redis_available():
    try:
        cache = get_redis()
        return cache.ping()
    except Exception as e:
        print(f"Connection to redis failed with {e}")
    return False


def is_solr_available():
    base_url = env.search_url()["URL"]
    try:
        response = requests.get(f"{base_url}/admin/info/system")
        response.raise_for_status()
        return response.json()["responseHeader"]["status"] == 0
    except Exception as e:
        print(f"Connection to solr failed with {e}")
    return False


def retry(predicate, limit):
    """
    Tests result of a predicate function:
     - in a loop;
     - up to a limit of attempts (raise StartupError after reaching limit);
     - with exponential backoff up to a minute;
    """
    jitter = random.uniform(-1, 1)
    for i in range(limit):
        if predicate():
            break
        else:
            time.sleep(min(1.5**i, 60) + jitter)
            continue
    else:
        raise StartupError
