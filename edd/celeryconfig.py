# Defines configuration parameters for EDD's Celery distributed task queue

import socket

## Broker Settings
BROKER_URL = 'amqp://guest:guest@localhost:5672//'

CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE='US/Pacific'

# List of modules to import when celery starts
CELERY_IMPORTS = ('edd.remote_tasks',)

#############################################################
## Configure database backend to stare task state and results
#############################################################
CELERY_RESULT_BACKEND = 'db+postgresql://edduser:3vExL@QxqQ*PmT3@localhost/edddjango' # TODO -- replace password with a generic String before promote

# echo enables verbose logging from SQLAlchemy.
# CELERY_RESULT_ENGINE_OPTIONS = {'echo': True}

# prevent errors due to connection timeouts while traffic is relatively low.
# remove to drastically improve performance when throughput is higher
CELERY_RESULT_DB_SHORT_LIVED_SESSIONS = True

# optionally use custom table names for the database result backend.
# CELERY_RESULT_DB_TABLENAMES = {
#     'task': 'myapp_taskmeta',
#     'group': 'myapp_groupmeta',
# }

#############################################################
# Remove pickle from the transport list for forward-
# compatability with Celery 3.2 (upcoming). Also avoids an
# error message in 3.1 mentioning this issue.
# Pickle is known to be insecure.
#############################################################
CELERY_ACCEPT_CONTENT = ['json', 'msgpack', 'yaml']

# Other stuff from sample
#CELERY_ANNOTATIONS = !{'tasks.add'Q {'rate_limit': '10/s'}}

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
ADMINS=[("Mark Forrer", "mark.forrer@lbl.gov"),] # TODO: set up an admin listserv and use that for production

##############################################################
# Other potentially useful items
##############################################################
# CELERYD_MAX_TASKS_PER_CHILD=100 # work around task memory leaks
# CELERYD_TASK_TIME_LIMIT=30 # per-task time limit in seconds before worker is killed
# CELERYD_TASK_SOFT_TIME_LIMIT=20 # per-task time limit in seconds before worker is notified of impending hard time limit