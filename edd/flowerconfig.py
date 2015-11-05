"""
This file contains configuration data for EDD's Celery Flower monitoring & management web
application. For a full description of options available here, see
http://flower.readthedocs.org/en/latest/config.html
"""

from celery import Celery
from edd.settings import config


# Broker Settings
RABBITMQ_HOST = config['rabbitmq'].get('hostname')
EDD_RABBITMQ_USERNAME = config['rabbitmq'].get('edd_user')
EDD_RABBITMQ_PASSWORD = config['rabbitmq'].get('edd_pass')
RABBITMQ_PORT = config['rabbitmq'].get('port')
EDD_VHOST = config['rabbitmq'].get('edd_vhost')

RABBITMQ_MGMT_USERNAME = config['rabbitmq'].get('mgmt_user', 'bunny')
RABBITMQ_MGMT_PASSWORD = config['rabbitmq'].get('mgmt_pass', '')
RABBITMQ_MGMT_PORT = config['rabbitmq'].get('mgmt_port', 15672)
MGMT_INTERFACE_URL = 'amqp://%(user)s:%(pass)s@%(host)s/%(vhost)s' % {
    'user': RABBITMQ_MGMT_USERNAME,
    'pass': RABBITMQ_MGMT_PASSWORD,
    'host': RABBITMQ_HOST,
    'vhost': EDD_VHOST,
}

# Set up a separate Celery "app" (instance of the Celery API) for Flower use. This is essentially
# just a workaround for flower not allowing broker_url to be configure via the config file. This
# appears to be configurable via line only as of Flower 0.9, also requiring the password as part
# of the URL (a security flaw).
#
# Note that errors in testing variations on broker_url input are only visible in Flower logs when a
# user has accessed Flower's "Broker" tab. Cryptic error messages mention "Failed management API
# call".
# TODO: we should investigate improving on this by allowing limited RabbitMQ managament access to
# edd_user for the edd vhost only. that may allow us to avoid providing the account password on
# the command line (what this workaround avoids), and also allow us to avoid creating a second
# Celery 'app' instance here
flower_mgmt_interface = Celery('flower', broker=MGMT_INTERFACE_URL)


# NOTE: Flower 0.9 doesn't support these via config file (only lower case via command line). See
# comments above.
# BROKER_URL = 'amqp://' + RABBITMQ_MGMT_USERNAME +':' + RABBITMQ_MGMT_PASSWORD + '@' +
#   RABBITMQ_HOST + ':'+ RABBITMQ_PORT + '/' + EDD_VHOST
# broker_url=BROKER_URL
# broker_api='http://' + RABBITMQ_MGMT_USERNAME +':' + RABBITMQ_MGMT_PASSWORD + '@' +
#   RABBITMQ_HOST + ':' + RABBITMQ_MGMT_PORT + '/api/' # used only by Flower

# general flower options
logging = 'INFO'

# Web interface access control
# TODO: this appears to work on the command line, but not via configuration file
# FLOWER_WEB_APP_USERNAME='flower'#
# FLOWER_WEB_APP_PASSWORD='PASSWORD1'
# basic_auth=FLOWER_WEB_APP_USERNAME + ':' + FLOWER_WEB_APP_PASSWORD
