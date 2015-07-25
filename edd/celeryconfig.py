# Defines configuration parameters for EDD's Celery distributed task queue

from datetime import timedelta
import socket

#############################################################
# General settings for celery
#############################################################
## Broker Settings
BROKER_URL = 'amqp://guest:guest@localhost:5672//'

CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
# CELERY_TIMEZONE='America/Los_Angeles' # Use UTC time to work around a Celery bug that causes flower charts to always be blank -- see https://github.com/celery/celery/issues/2482

# Remove pickle from the transport list for forward-
# compatability with Celery 3.2 (upcoming). Also avoids an
# error message in 3.1 mentioning this issue.
# Pickle is known to be insecure.
CELERY_ACCEPT_CONTENT = ['json', 'msgpack', 'yaml']

#############################################################
# Routers and queues for EDD.
#############################################################

# A simplistic router that routes all Celery messages into the
# "edd" exchange, and from there onto the "edd" queue. This is essentially
# just allowing us flexibility to use the same RabbitMQ server to support
# multiple applications at JBEI. If needed, we can use more complex routing
# later to improve throughtput for EDD.
class SingleQueueRouter(object):

    def route_for_task(self, task, args=None, kwargs=None):
            return {'exchange': 'edd',
                    'exchange_type': 'fanout',
                    'routing_key': 'edd'}
                    
CELERY_ROUTES =(SingleQueueRouter(),)

# route all tasks to the edd queue unless specifically
# called out by CELERY_QUEUES
CELERY_DEFAULT_EXCHANGE='edd'
CELERY_DEFAULT_QUEUE = 'edd'

CELERY_DEFAULT_ROUTING_KEY = 'edd'

#############################################################
# Task configuration
#############################################################
CELERYD_TASK_SOFT_TIME_LIMIT=270 # time limit in seconds after which a task is notified that it'll be killed soon
CELERYD_TASK_TIME_LIMIT=300 # upper limit in seconds that a task may take before it's host process is terminated

# List of modules to import when celery worker starts
CELERY_IMPORTS = ('edd.remote_tasks',)

# CELERYD_MAX_TASKS_PER_CHILD=100 # work around task memory leaks

#############################################################
## Configure database backend to store task state and results
#############################################################
CELERY_RESULT_BACKEND = 'db+postgresql://edduser:3vExL@QxqQ*PmT3@localhost/edddjango' # TODO -- replace password with a generic String before promote

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
CELERY_SEND_TASK_ERROR_EMAILS=True
SERVER_EMAIL="celery@"+socket.gethostname()
EMAIL_HOST="aspmx.l.google.com" # restricted Gmail server. No authentication required, but can only mail Gmail or Google app users
#EMAIL_HOST_USER
#EMAIL_HOST_PASSWORD
#EMAIL_PORT # default is 25
ADMINS=[("Mark Forrer", "mark.forrer@lbl.gov"),] # TODO: replace with jbei-edd-admin@lists.lbl.gov for production
