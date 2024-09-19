"""
Defines configuration for EDD's Celery worker(s), and for Celery-specific
custom EDD configuration options. Note that some of EDD's Celery tasks
override defaults configured here to accomodate their specific needs.

For Celery configuration reference, see:
https://docs.celeryproject.org/en/latest/configuration.html
"""

from kombu import Queue

from .base import env

# Broker Settings
CELERY_BROKER_URL = env("BROKER_URL")
CELERY_BROKER_CONNECTION_RETRY = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
# Try fixing problems with connection pool to RabbitMQ by disabling pool
# See: https://github.com/celery/celery/issues/4226
CELERY_BROKER_POOL_LIMIT = None

# Serialization settings
CELERY_ACCEPT_CONTENT = {"json", "edd-json"}
CELERY_TASK_SERIALIZER = "edd-json"
CELERY_RESULT_SERIALIZER = "edd-json"
CELERY_TASK_PUBLISH_RETRY = False

# Default queue
CELERY_TASK_DEFAULT_EXCHANGE = "edd"
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_DEFAULT_ROUTING_KEY = "default"

# Queue lists
# TODO: regularize the naming schemes on method names
CELERY_TASK_QUEUES = (
    Queue("default"),
    Queue("edd.export.tasks.export_table_task"),
    Queue("edd.export.tasks.export_worklist_task"),
    Queue("edd.load.tasks.run_rest_import"),
    Queue("edd.load.tasks.send_bulk_abuse_email"),
    Queue("edd.load.tasks.wizard_process"),
    Queue("edd.load.tasks.wizard_save"),
    Queue("edd.load.tasks.wizard_update"),
    Queue("edd.profile.tasks.send_approved_account_email"),
    Queue("edd.search.tasks.reindex_all"),
    Queue("edd.setup.tasks.setup_commit"),
    Queue("edd.setup.tasks.setup_process"),
    Queue("edd.setup.tasks.setup_rest_payload"),
    Queue("edd.setup.tasks.setup_update"),
    Queue("main.admin.migrate_storage"),
    Queue("main.models.measurement_type.lookup_protein_in_uniprot"),
    Queue("main.models.measurement_type.metabolite_load_pubchem"),
    Queue("main.tasks.template_sync_species"),
)
# map task to own queue, leaving out the first (default) queue
CELERY_TASK_ROUTES = {q.name: q.name for q in CELERY_TASK_QUEUES[1:]}

CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")
