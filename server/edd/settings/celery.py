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
# TODO: change "describe" to "setup" when the module name changes
# TODO: regularize the naming schemes on method names
CELERY_TASK_QUEUES = (
    Queue("default"),
    Queue("edd.describe.tasks.clear_error_report"),
    Queue("edd.describe.tasks.send_describe_failed_email_admin"),
    Queue("edd.describe.tasks.send_describe_failed_email_user"),
    Queue("edd.describe.tasks.send_describe_success_email"),
    Queue("edd.export.tasks.export_table_task"),
    Queue("edd.export.tasks.export_worklist_task"),
    Queue("edd.load.tasks.send_wizard_failed_email"),
    Queue("edd.load.tasks.send_wizard_paused_email"),
    Queue("edd.load.tasks.send_wizard_success_email"),
    Queue("edd.load.tasks.wizard_execute_loading"),
    Queue("edd.load.tasks.wizard_parse_and_resolve"),
    Queue("main.models.measurement_type.lookup_protein_in_uniprot"),
    Queue("main.models.measurement_type.metabolite_load_pubchem"),
    Queue("main.tasks.link_ice_entry_to_study"),
    Queue("main.tasks.template_sync_species"),
    Queue("main.tasks.unlink_ice_entry_from_study"),
)
# map task to own queue, leaving out the first (default) queue
CELERY_TASK_ROUTES = {q.name: q.name for q in CELERY_TASK_QUEUES[1:]}

CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")
