# coding: utf-8
"""
Defines configuration parameters for EDD's Celery distributed task queue and some parameters for the
Celery Flower add-on web interface for Celery monitoring and management.

For the full list of configuration settings, see
http://celery.readthedocs.org/en/latest/configuration.html for Celery and
http://flower.readthedocs.org/en/latest/config.html#conf for the Celery Flower add on. Also see
flowerconfig.py where most of the flower configuration data are.
"""

import json
import os
import socket

from datetime import timedelta
from django.conf import settings
from edd_utils.parsers.json_encoders import EXTENDED_JSON_CONTENT_TYPE

####################################################################################################
# Configure email notifications for task errors
####################################################################################################

# controls initial retry warning email & subsequent failure/resolution message
CELERY_SEND_TASK_ERROR_EMAILS = True
SERVER_EMAIL = "celery@" + socket.gethostname()

# identically-named settings from Django...this way we at least have an explicit  list of what's
# inherited
EMAIL_HOST_USER = settings.EMAIL_HOST_USER
EMAIL_HOST_PASSWORD = settings.EMAIL_HOST_PASSWORD
EMAIL_HOST = settings.EMAIL_HOST
EMAIL_PORT = settings.EMAIL_PORT


####################################################################################################
# EDD-specific configuration for Celery (NOT Celery-defined constants as in the rest of the file
####################################################################################################
# buffer around the final retry during which no warning emails will be sent
CELERY_MIN_WARNING_GRACE_PERIOD_MIN = 30

# Shared defaults for Celery communication with ICE. May be overridden on a task-by-task basis,
# depending on the processing being performed. These defaults are appropriate for simple ICE
# queries or data pushes that don't do a significant amount of processing, and execute quickly
# with each retry attempt. For help in configuring new defaults, run time_until_retry() or
# compute_exp_retry_delay() in celery_utils.py from the command line.

# seconds before first retry attempt. assumption is exponential backoff.
CELERY_INITIAL_ICE_RETRY_DELAY = 2
# ~= 14 seconds total wait after initial failure (execution+timeout are extra)
CELERY_WARN_AFTER_RETRY_NUM_FOR_ICE = 3
# ~= 2 weeks total wait...plenty of overhead for outages without intervention/data loss
CELERY_MAX_ICE_RETRIES = 19

####################################################################################################
# Load urls and authentication credentials from server.cfg (TODO: some other stuff in there should
# be moved here)
####################################################################################################
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
try:
    with open(os.path.join(BASE_DIR, 'server.cfg')) as server_cfg:
        config = json.load(server_cfg)
except IOError:
    print("Required configuration file server.cfg is missing from %s"
          "Copy from server.cfg-example and fill in appropriate values" % BASE_DIR)
    raise

####################################################################################################
# General settings for celery
####################################################################################################
# Broker Settings
RABBITMQ_HOST = config['rabbitmq'].get('hostname')
EDD_RABBITMQ_USERNAME = config['rabbitmq'].get('edd_user')
EDD_RABBITMQ_PASSWORD = config['rabbitmq'].get('edd_pass')
RABBITMQ_PORT = config['rabbitmq'].get('port')
EDD_VHOST = config['rabbitmq'].get('edd_vhost')
BROKER_URL = 'amqp://%(user)s:%(pass)s@%(host)s:%(port)s/%(vhost)s' % {
             'user': EDD_RABBITMQ_USERNAME,
             'pass': EDD_RABBITMQ_PASSWORD,
             'host': RABBITMQ_HOST,
             'port': RABBITMQ_PORT,
             'vhost': EDD_VHOST,
}

# CELERY_TASK_SERIALIZER = 'auth' #TODO
# CELERY_RESULT_SERIALIZER = 'auth'
CELERY_TASK_SERIALIZER = EXTENDED_JSON_CONTENT_TYPE
CELERY_RESULT_SERIALIZER = EXTENDED_JSON_CONTENT_TYPE

# CELERY_TIMEZONE='America/Los_Angeles' # Use UTC time to work around a Celery 3.1.18 bug
# that causes flower charts to always be blank -- see https://github.com/celery/celery/issues/2482

# Remove pickle from the transport list for forward-
# compatibility with Celery 3.2 (upcoming). Also avoids an
# error message in 3.1 mentioning this issue.
# Pickle transport is known to be insecure.
CELERY_ACCEPT_CONTENT = [EXTENDED_JSON_CONTENT_TYPE, 'json', 'msgpack', 'yaml']


####################################################################################################
# Security settings for signing celery messages (contents are not encrypted)
####################################################################################################
# CELERY_SECURITY_KEY = '/etc/ssl/private/worker.key' #TODO:
# CELERY_SECURITY_CERTIFICATE = '/etc/ssl/certs/worker.pem' #TODO:
# CELERY_SECURITY_CERT_STORE = '/etc/ssl/certs/*.pem' #TODO:
# from celery.security import setup_security
# setup_security()

####################################################################################################
# Routers and queues for EDD.
####################################################################################################

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

####################################################################################################
# Task configuration
####################################################################################################
# seconds after which a task is notified that it'll be killed soon (5 min)
CELERYD_TASK_SOFT_TIME_LIMIT = 270
# upper limit in seconds a run can take before host process is terminated (5 min 30 sec)
CELERYD_TASK_TIME_LIMIT = 300

# List of modules to import when celery worker starts.
# Note: alternatively, we could have Celery auto-discover all
# tasks in each reusable Django app, but at the cost of following
# the less descriptive naming convention 'tasks.py'
CELERY_IMPORTS = ('edd.remote_tasks',)

# CELERYD_MAX_TASKS_PER_CHILD=100 # work around possible task memory leaks

####################################################################################################
# Configure database backend to store task state and results
####################################################################################################
DB_USER = config['db'].get('user', 'edduser')
DB_PASSWORD = config['db'].get('pass', '')
DB_HOST = config['db'].get('host', 'localhost')
DB_NAME = config['db'].get('database', 'localhost')
CELERY_RESULT_BACKEND = ('db+postgresql://%(db_user)s:%(db_password)s@%(db_host)s/%(db_name)s'
                         % {
                             'db_user': DB_USER,
                             'db_password': DB_PASSWORD,
                             'db_host': DB_HOST,
                             'db_name': DB_NAME
                         })

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

CELERY_REDIRECT_STDOUTS_LEVEL = 'WARN'  # override the default setting of 'WARN'

# convert dictionary required by JSON-formatted server.cfg to list of (name, email) tuples required
# by Celery, also converting from the JSON Unicode to ASCII to avoid problems with sending email.
admins_dict_temp = config['site'].get('admins', [])
recipients_tuple_list = []
force_ascii = True
for raw_name in admins_dict_temp:
    raw_email = admins_dict_temp[raw_name]

    formatted_email = ''
    if force_ascii:
        ascii_name = raw_name.encode('ascii', 'replace')
        ascii_email = raw_email.encode('ascii', 'replace')
        recipients_tuple_list.append((ascii_name, ascii_email))
    else:
        recipients_tuple_list.append((raw_name, raw_email))
ADMINS = recipients_tuple_list  # set value required by Celery (caps!)
