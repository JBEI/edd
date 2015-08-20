"""
Defines configuration parameters for EDD's Celery distributed task queue and some parameters for the Celery Flower
add-on web interface for Celery monitoring and management.

For the full list of configuration settings, see http://celery.readthedocs.org/en/latest/configuration.html
for Celery and http://flower.readthedocs.org/en/latest/config.html#conf for the Celery Flower add on. Also see flowerconfig.py
where most of the flower configuration data are.
"""

from datetime import timedelta
import socket
import os
import json

#############################################################
# Load system-dependent settings from server.cfg
#############################################################
BASE_DIR = os.path.dirname(os.path.dirname('__file__'))
try:
    with open(os.path.join(BASE_DIR, 'server.cfg')) as server_cfg:
        config = json.load(server_cfg)
except IOError:
    print "Required configuration file server.cfg is missing. " \
          "Copy from server.cfg-example and fill in appropriate values"
    raise

#############################################################
# General settings for celery
#############################################################
# Broker Settings
RABBITMQ_HOST = config['rabbitmq'].get('hostname')
EDD_RABBITMQ_USERNAME = config['rabbitmq'].get('edd_user')
EDD_RABBITMQ_PASSWORD = config['rabbitmq'].get('edd_pass')
RABBITMQ_PORT = config['rabbitmq'].get('port')
EDD_VHOST = config['rabbitmq'].get('edd_vhost')
BROKER_URL = 'amqp://' + EDD_RABBITMQ_USERNAME + ':' + EDD_RABBITMQ_PASSWORD + '@' + RABBITMQ_HOST + ':' + RABBITMQ_PORT + '/' + EDD_VHOST

# CELERY_TASK_SERIALIZER = 'auth' #TODO
# CELERY_RESULT_SERIALIZER = 'auth'
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'

# CELERY_TIMEZONE='America/Los_Angeles' # Use UTC time to work around a Celery 3.1.18 bug
# that causes flower charts to always be blank -- see https://github.com/celery/celery/issues/2482

# Remove pickle from the transport list for forward-
# compatibility with Celery 3.2 (upcoming). Also avoids an
# error message in 3.1 mentioning this issue.
# Pickle transport is known to be insecure.
CELERY_ACCEPT_CONTENT = ['json', 'msgpack', 'yaml']


##############################################################
# Security settings for signing celery messages (contents are not encrypted)
##############################################################
# CELERY_SECURITY_KEY = '/etc/ssl/private/worker.key' #TODO:
# CELERY_SECURITY_CERTIFICATE = '/etc/ssl/certs/worker.pem' #TODO:
# CELERY_SECURITY_CERT_STORE = '/etc/ssl/certs/*.pem' #TODO:
# from celery.security import setup_security
# setup_security()

#############################################################
# Routers and queues for EDD.
#############################################################

# A simplistic router that routes all Celery messages into the
# "edd" exchange, and from there onto the "edd" queue. This is essentially
# just allowing us flexibility to use the same RabbitMQ server to support
# multiple applications at JBEI. If needed, we can use more complex routing
# later to improve throughput for EDD.
class SingleQueueRouter(object):
    def route_for_task(self, task, args=None, kwargs=None):
        return {'exchange': 'edd',
                'exchange_type': 'fanout',
                'routing_key': 'edd'}


CELERY_ROUTES = (SingleQueueRouter(),)

# route all tasks to the edd queue unless specifically
# called out by CELERY_QUEUES
CELERY_DEFAULT_EXCHANGE = 'edd'
CELERY_DEFAULT_QUEUE = 'edd'
CELERY_DEFAULT_ROUTING_KEY = 'edd'

#############################################################
# Task configuration
#############################################################
CELERYD_TASK_SOFT_TIME_LIMIT = 270  # time limit in seconds after which a task is notified that it'll be killed soon
CELERYD_TASK_TIME_LIMIT = 300  # upper limit in seconds that a task may take before its host process is terminated

# List of modules to import when celery worker starts.
# Note: alternatively, we could have Celery auto-discover all
# tasks in each reusable Django app, but at the cost of following
# the less descriptive naming convention 'tasks.py'
CELERY_IMPORTS = ('edd.remote_tasks',)

# CELERYD_MAX_TASKS_PER_CHILD=100 # work around task memory leaks

#############################################################
# Configure database backend to store task state and results
#############################################################
DB_USER = config['db'].get('user', 'edduser')
DB_PASSWORD = config['db'].get('pass', '')
DB_HOST = config['db'].get('host', 'localhost')
DB_NAME = config['db'].get('database', 'localhost')
CELERY_RESULT_BACKEND = 'db+postgresql://' + DB_USER + ':' + DB_PASSWORD + '@' + DB_HOST + '/' + DB_NAME

# echo enables verbose logging from SQLAlchemy.
# CELERY_RESULT_ENGINE_OPTIONS = {'echo': True}

# prevent errors due to database connection timeouts while traffic is relatively low.
# remove to drastically improve performance when throughput is higher
CELERY_RESULT_DB_SHORT_LIVED_SESSIONS = True

# initially keep task results for 30 days to enable some history
# inspection while load is low
CELERY_TASK_RESULT_EXPIRES = timedelta(days=30)

# optionally use custom table names for the database result backend.
# CELERY_RESULT_DB_TABLENAMES = {
#     'task': 'myapp_taskmeta',
#     'group': 'myapp_groupmeta',
# }

#############################################################
# Configure email notifications for task errors
#############################################################
# CELERY_TASK_RESULT_EXPIRES=3600, #TODO
# TODO: get values from server.cfg`
CELERY_SEND_TASK_ERROR_EMAILS = config['celery'].get('send_task_error_emails', True)
SERVER_EMAIL = "celery@" + socket.gethostname()
EMAIL_HOST = config['email'].get('host', 'localhost')
EMAIL_HOST_USER = config['email'].get('user', '')
EMAIL_HOST_PASSWORD = config['email'].get('pass', '')
EMAIL_PORT = config['email'].get('port', "25")
ADMINS = [("Mark Forrer", "mark.forrer@lbl.gov"), ]  # TODO: replace with jbei-edd-admin@lists.lbl.gov for production
