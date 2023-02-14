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

CELERY_ACCEPT_CONTENT = {"json", "edd-json"}
CELERY_TASK_SERIALIZER = "edd-json"
CELERY_RESULT_SERIALIZER = "edd-json"
CELERY_TASK_PUBLISH_RETRY = False

# Default queue
CELERY_TASK_DEFAULT_EXCHANGE = "edd"
CELERY_TASK_DEFAULT_QUEUE = "edd"
CELERY_TASK_DEFAULT_ROUTING_KEY = "edd"

# Queue lists
# TODO: change "describe" to "setup" when the module name changes
CELERY_TASK_QUEUES = (
    Queue("edd"),
    Queue("describe.clear_error_report"),
    Queue("describe.send_describe_failed_email_admin"),
    Queue("describe.send_describe_failed_email_user"),
    Queue("describe.send_describe_success_email"),
    Queue("export.export_table_task"),
    Queue("export.export_worklist_task"),
    Queue("load.import_table_task"),
    Queue("load.send_import_completion_email"),
    Queue("load.send_import_failure_email_admins"),
    Queue("load.send_import_failure_email"),
    Queue("load.send_wizard_failed_email"),
    Queue("load.send_wizard_paused_email"),
    Queue("load.send_wizard_success_email"),
    Queue("load.wizard_execute_loading"),
    Queue("load.wizard_parse_and_resolve"),
    Queue("main.link_ice_entry_to_study"),
    Queue("main.template_sync_species"),
    Queue("main.unlink_ice_entry_from_study"),
)

CELERY_TASK_ROUTES = {
    "edd.describe.tasks.clear_error_report": "describe.clear_error_report",
    "edd.describe.tasks.send_describe_failed_email_admin": "describe.send_describe_failed_email_admin",
    "edd.describe.tasks.send_describe_failed_email_user": "describe.send_describe_failed_email_user",
    "edd.describe.tasks.send_describe_success_email": "describe.send_describe_success_email",
    "edd.export.tasks.export_table_task": "export.export_table_task",
    "edd.export.tasks.export_worklist_task": "export.export_worklist_task",
    "edd.load.tasks.import_table_task": "load.import_table_task",
    "edd.load.tasks.send_import_completion_email": "load.send_import_completion_email",
    "edd.load.tasks.send_import_failure_email_admins": "load.send_import_failure_email_admins",
    "edd.load.tasks.send_import_failure_email": "load.send_import_failure_email",
    "edd.load.tasks.send_wizard_failed_email": "load.send_wizard_failed_email",
    "edd.load.tasks.send_wizard_paused_email": "load.send_wizard_paused_email",
    "edd.load.tasks.send_wizard_success_email": "load.send_wizard_success_email",
    "edd.load.tasks.wizard_execute_loading": "load.wizard_execute_loading",
    "edd.load.tasks.wizard_parse_and_resolve": "load.wizard_parse_and_resolve",
    "main.models.measurement_type.lookup_protein_in_uniprot": "models.measurement_type.lookup_protein_in_uniprot",
    "main.models.measurement_type.metabolite_load_pubchem": "models.measurement_type.metabolite_load_pubchem",
    "main.tasks.link_ice_entry_to_study": "tasks.link_ice_entry_to_study",
    "main.tasks.template_sync_species": "tasks.template_sync_species",
    "main.tasks.unlink_ice_entry_from_study": "tasks.unlink_ice_entry_from_study",
}

# Try fixing problems with connection pool to RabbitMQ by disabling pool
# See: https://github.com/celery/celery/issues/4226
CELERY_BROKER_POOL_LIMIT = None

CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")
