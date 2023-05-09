import invoke

from . import prereq, util

STARS = "*" * 80
STARTUP_SCRIPT = "/usr/local/bin/start_edd_process.sh"


# watch_static: Watch for changes in static resources
@invoke.task(pre=[prereq.staticfiles, prereq.owner])
def watch_static(context):
    """
    Watches for changes to static assets in background.

    Starts a background process watching for staticfiles changes and runs the
    collectstatic task when changes are detected.
    """
    print("TODO: watch_static is not implemented yet")
    # operate under a mutex
    # check if any containers are currently running watch
    # try to detect if other container running watch is still up and recover
    # if not, register self as running watch
    # then, run /code/manage.py edd_collectstatic --watch &


@invoke.task(pre=[prereq.errorpage, prereq.rabbitmq, prereq.owner, prereq.checkuser])
def gunicorn(context):
    """Executes EDD as a Django site with Gunicorn."""
    with open(STARTUP_SCRIPT, "w") as script:
        print("#!/bin/bash", file=script)
        print("set -euxo pipefail", file=script)
        print(
            # use exec so that the command here becomes PID 1
            "exec "
            # run gunicorn as edduser, using gosu
            "gosu edduser gunicorn "
            # with four worker processes
            "-w 4 "
            # listening on all IPv4 interfaces port 8000
            "-b 0.0.0.0:8000 "
            # using gthread worker class
            # this functioned OK with streaming responses, while gevent failed
            "-k gthread "
            # use /dev/shm for worker heartbeat files
            # https://pythonspeed.com/articles/gunicorn-in-docker/
            "--worker-tmp-dir /dev/shm "
            # disable use of sendfile()
            # suggested in documentation for gunicorn
            "--no-sendfile "
            # disable checking front-end IPs as we won't know nginx IP
            "--forwarded-allow-ips '*' "
            # give the module and name of the WSGI application
            "edd.wsgi:application ",
            file=script,
        )
    context.run(f'chmod +x "{STARTUP_SCRIPT}"')
    print(STARS)
    print("Starting production appserver …")
    print(STARS)


@invoke.task(pre=[prereq.errorpage, prereq.owner])
def daphne(context):
    """Executes EDD as a Channels application with Daphne."""
    with open(STARTUP_SCRIPT, "w") as script:
        print("#!/bin/bash", file=script)
        print("set -euxo pipefail", file=script)
        print(
            # use exec so that the command here becomes PID 1
            "exec "
            # run daphne as edduser, using gosu
            "gosu edduser daphne "
            # listening on all IPv4 interfaces
            "-b 0.0.0.0 "
            # listening on port 8000
            "-p 8000 "
            # give the module and name of the ASGI application
            "edd.asgi:application ",
            file=script,
        )
    context.run(f'chmod +x "{STARTUP_SCRIPT}"')
    print(STARS)
    print("Starting daphne …")
    print(STARS)


@invoke.task(pre=[prereq.migrations, prereq.rabbitmq, prereq.owner])
def celery(context):
    """Executes EDD as a Celery worker."""
    # TODO: the below might be removed
    # some celery code attempted to write to /usr/local/edd/log in the past
    util.ensure_dir_owner(context, "/usr/local/edd/log")

    with open(STARTUP_SCRIPT, "w") as script:
        print("#!/bin/bash", file=script)
        print("set -euxo pipefail", file=script)
        print(
            # use exec so that the command here becomes PID 1
            "exec "
            # run as edduser, using gosu
            "gosu edduser "
            # running celery command
            "celery "
            # using the edd project
            "-A edd "
            # and the worker sub-command
            "worker "
            # using INFO logging level
            "-l info ",
            file=script,
        )
    context.run(f'chmod +x "{STARTUP_SCRIPT}"')
    print(STARS)
    print("Starting Celery worker …")
    print(STARS)


namespace = invoke.Collection(prereq, watch_static, gunicorn, daphne, celery)
