import os

AMQP_USERNAME = os.getenv('AMQP_USERNAME', 'guest')
AMQP_PASSWORD = os.getenv('AMQP_PASSWORD', 'guest')
AMQP_HOST = os.getenv('AMQP_HOST', 'rabbitmq')
AMQP_PORT = int(os.getenv('AMQP_PORT', '5672'))

DEFAULT_BROKER_URL = 'amqp://%(user)s:%(pass)s@%(host)s:%(port)d' % {
    'user': AMQP_USERNAME,
    'pass': AMQP_PASSWORD,
    'host': AMQP_HOST,
    'port': AMQP_PORT,
}

BROKER_URL = os.getenv('BROKER_URL', DEFAULT_BROKER_URL)
