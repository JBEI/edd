# flower 0.9-edd

This Dockerfile builds an image to run the [Celery Flower][1] monitoring tool for [Celery][2]
task queues. It uses the 0.9 version. The image is not meant to be run stand-alone. The container
will wait for the [RabbitMQ][3] service to begin responding before it launches.

The container makes use of the following environment:
* __AMQP_ADMIN_HOST__: the host to use when connecting to RabbitMQ admin (default `rabbitmq`)
* __AMQP_ADMIN_PASSWORD__: the password to use when connecting to RabbitMQ admin (default `guest`)
* __AMQP_ADMIN_PORT__: the port to use when connecting to RabbitMQ admin (default `15672`)
* __AMQP_ADMIN_USERNAME__: the username to use when connecting to RabbitMQ admin (default `guest`)
* __AMQP_FLOWER_PASSWORD__: the password used to access the Flower interface w/ HTTP Basic Auth
  (default `changeit`)
* __AMQP_FLOWER_USERNAME__: the username used to access the Flower interface w/ HTTP Basic Auth
  (default `root`)
* __AMQP_HOST__: the host to use when connecting to RabbitMQ (default `rabbitmq`)
* __AMQP_PASSWORD__: the password to use when connecting to RabbitMQ (default `guest`)
* __AMQP_PORT__: the port to use when connecting to RabbitMQ (default `5672`)
* __AMQP_USERNAME__: the username to use when connecting to RabbitMQ (default `guest`)
* __BROKER_URL__: the full connection URL when connecting to RabbitMQ; if missing, constructed
  from `AMQP_USERNAME`, `AMQP_PASSWORD`, `AMQP_HOST`, and `AMQP_PORT`
* __FLOWER_BASIC_AUTH__: the HTTP Basic Auth string used to access the Flower interface; if
  missing, constructed from `AMQP_FLOWER_USERNAME` and `AMQP_FLOWER_PASSWORD`
* __FLOWER_BROKER_API__: the full connection URL when connecting to RabbitMQ admin; if missing,
  constructed from `AMQP_ADMIN_USERNAME`, `AMQP_ADMIN_PASSWORD`, `AMQP_ADMIN_HOST`,
  and `AMQP_ADMIN_PORT`
* __FLOWER_MAX_TASKS__: the maximum number of tasks to keep in memory (default `3600`)
* __FLOWER_PORT__: the port used to access the Flower interface (default `5555`)
* __FLOWER_URL_PREFIX__: the URL prefix to access the Flower interface from a non-root URL (root
  is default)

---------------------------------------------------------------------------------------------------

[1]:    http://flower.readthedocs.io/en/latest/
[2]:    http://www.celeryproject.org/
[3]:    ../rabbitmq/README.md
