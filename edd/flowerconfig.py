"""
This file contains configuration data for EDD's Celery Flower monitoring & management web application.
For a full description of options available here, see http://flower.readthedocs.org/en/latest/config.html
"""

from celery import Celery
from edd.celeryconfig import EDD_RABBITMQ_USERNAME, EDD_RABBITMQ_PASSWORD, RABBITMQ_HOST, RABBITMQ_PORT, EDD_VHOST # TODO put this shared data in server.cfg instead

## Broker Settings
RABBITMQ_MGMT_USERNAME='bunny'
RABBITMQ_MGMT_PASSWORD='PASSWORD_GOES_HERE' # TODO: consider moving to server.cfg
RABBITMQ_MGMT_PORT = '15672'

# workaround for flower not allowing broker_url to be configure via the config file (cmd line only)
# TODO: we should investigate improving on this by allowing limited RabbitMQ managament access to edd_user for the edd vhost only.
# that may allow us to avoid providing the account password on the command line (what this workaround avoids), and also allow
# us to avoid creating a secord Celery 'app' instance here
flower_mgmt_interface = Celery('flower', broker='amqp://' + RABBITMQ_MGMT_USERNAME + ':' + RABBITMQ_MGMT_PASSWORD + '@' + RABBITMQ_HOST + '/' + EDD_VHOST)

# NOTE: Flower 0.9 doesn't support these via config file (only lower case via command line)
# BROKER_URL = 'amqp://' + RABBITMQ_MGMT_USERNAME +':' + RABBITMQ_MGMT_PASSWORD + '@' + RABBITMQ_HOST + ':'+ RABBITMQ_PORT + '/' + EDD_VHOST
# broker_url=BROKER_URL

# general flower options
logging='DEBUG'


# RabbitMQ Management API --  TODO: currently performs identically to leaving this unspecified (on both cmd line and in file... need to investigate).
# Failed management API calls in the "Broker" tab seem to indicate this isn't working
# broker_api='http://' + RABBITMQ_MGMT_USERNAME +':' + RABBITMQ_MGMT_PASSWORD + '@' + RABBITMQ_HOST + ':' + RABBITMQ_MGMT_PORT + '/api/' # used only by Flower

# Web interface access control
# TODO: this appears to work on the command line, but not via configuration file
# FLOWER_WEB_APP_USERNAME='flower'#
# FLOWER_WEB_APP_PASSWORD='PASSWORD1'
# basic_auth=FLOWER_WEB_APP_USERNAME + ':' + FLOWER_WEB_APP_PASSWORD