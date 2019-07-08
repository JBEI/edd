import os


def load_secret(name, default=None):
    try:
        with open(f"/run/secrets/{name}") as f:
            return f.read().strip()
    except Exception:
        return default


AMQP_USERNAME = os.getenv("AMQP_USERNAME", "guest")
AMQP_PASSWORD = load_secret("flower_amqp_password", default="guest")
AMQP_HOST = os.getenv("AMQP_HOST", "rabbitmq")
AMQP_PORT = int(os.getenv("AMQP_PORT", "5672"))
AMQP_VHOST = os.getenv("AMQP_VHOST", "edd")

BROKER_URL = "amqp://%(user)s:%(pass)s@%(host)s:%(port)d/%(vhost)s" % {
    "user": AMQP_USERNAME,
    "pass": AMQP_PASSWORD,
    "host": AMQP_HOST,
    "port": AMQP_PORT,
    "vhost": AMQP_VHOST,
}
