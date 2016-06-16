import os

AMQP_ADMIN_USERNAME = os.getenv('AMQP_ADMIN_USERNAME', 'guest')
AMQP_ADMIN_PASSWORD = os.getenv('AMQP_ADMIN_PASSWORD', 'guest')
AMQP_ADMIN_HOST = os.getenv('AMQP_ADMIN_HOST', 'rabbitmq')
AMQP_ADMIN_PORT = int(os.getenv('AMQP_ADMIN_PORT', '15672'))

DEFAULT_BROKER_API = 'amqp://%(user)s:%(pass)s@%(host)s:%(port)d' % {
    'user': AMQP_ADMIN_USERNAME,
    'pass': AMQP_ADMIN_PASSWORD,
    'host': AMQP_ADMIN_HOST,
    'port': AMQP_ADMIN_PORT,
}

AMQP_FLOWER_USERNAME = os.getenv('AMQP_FLOWER_USERNAME', 'root')
AMQP_FLOWER_PASSWORD = os.getenv('AMQP_FLOWER_PASSWORD', 'changeit')

port = int(os.getenv('FLOWER_PORT', '5555'))
broker_api = os.getenv('FLOWER_BROKER_API', DEFAULT_BROKER_API)
max_tasks = int(os.getenv('FLOWER_MAX_TASKS', '3600'))
basic_auth = [os.getenv('FLOWER_BASIC_AUTH', '%(user)s:%(pass)s' % {
    'user': AMQP_FLOWER_USERNAME,
    'pass': AMQP_FLOWER_PASSWORD,
})]
url_prefix = os.getenv('FLOWER_URL_PREFIX', '')
