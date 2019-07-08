import os


def load_secret(name, default=None):
    try:
        with open(f"/run/secrets/{name}") as f:
            return f.read().strip()
    except Exception:
        return default


AMQP_ADMIN_USERNAME = os.getenv("AMQP_ADMIN_USERNAME", "guest")
AMQP_ADMIN_PASSWORD = load_secret("flower_amqp_admin_password", default="guest")
AMQP_ADMIN_HOST = os.getenv("AMQP_ADMIN_HOST", "rabbitmq")
AMQP_ADMIN_PORT = int(os.getenv("AMQP_ADMIN_PORT", "15672"))

broker_api = "http://%(user)s:%(pass)s@%(host)s:%(port)d/api" % {
    "user": AMQP_ADMIN_USERNAME,
    "pass": AMQP_ADMIN_PASSWORD,
    "host": AMQP_ADMIN_HOST,
    "port": AMQP_ADMIN_PORT,
}

FLOWER_USERNAME = os.getenv("FLOWER_USERNAME", "flower")
FLOWER_PASSWORD = load_secret("flower_amqp_password", "changeit")

port = int(os.getenv("FLOWER_PORT", "5555"))
max_tasks = int(os.getenv("FLOWER_MAX_TASKS", "3600"))
basic_auth = [f"{FLOWER_USERNAME}:{FLOWER_PASSWORD}"]
url_prefix = os.getenv("FLOWER_URL_PREFIX", "")
