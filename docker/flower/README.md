# flower 1.0.1

This Dockerfile builds an image to run the [Celery Flower][1] monitoring tool for [Celery][2]
task queues. It uses the 1.0.1 development version. The image is not meant to be run stand-alone.
The container will wait for the [RabbitMQ][3] service to begin responding before it launches.

Images are tagged with the version of Flower installed. Additional tags include the build date,
for reproducing environments. e.g. jbei/flower:1.0.1 will point to the latest build that uses
Flower v1.0.1, and jbei/flower:1.0.1-20180613 will point to the image built on 13 June, 2018.

The container makes use of the following environment:

-   **AMQP_ADMIN_HOST**: the host to use when connecting to RabbitMQ admin (default `rabbitmq`)
-   **AMQP_ADMIN_PORT**: the port to use when connecting to RabbitMQ admin (default `15672`)
-   **AMQP_ADMIN_USERNAME**: the username to use when connecting to RabbitMQ admin (default `guest`)
-   **AMQP_HOST**: the host to use when connecting to RabbitMQ (default `rabbitmq`)
-   **AMQP_PORT**: the port to use when connecting to RabbitMQ (default `5672`)
-   **AMQP_USERNAME**: the username to use when connecting to RabbitMQ (default `guest`)
-   **FLOWER_MAX_TASKS**: the maximum number of tasks to keep in memory (default `3600`)
-   **FLOWER_PASSWORD**: the password used to access the Flower interface w/ HTTP Basic Auth
-   **FLOWER_PASSWORD_FILE**: a file containing a password in lieu of using **FLOWER_PASSWORD**
-   **FLOWER_PORT**: the port used to access the Flower interface (default `5555`)
-   **FLOWER_URL_PREFIX**: the URL prefix to access the Flower interface from a non-root URL (root
    is default)
-   **FLOWER_USERNAME**: the username used to access the Flower interface w/ HTTP Basic Auth
    (default `root`)

The container expects to find Docker secrets of the following names:

-   **flower_amqp_admin_password**: the password to use when connecting to RabbitMQ admin
    (default `guest`)
-   **flower_amqp_password**: the password to use when connecting to RabbitMQ
    (default `guest`)
-   **flower_basic_auth**:the HTTP Basic Auth string used to access the Flower interface
    (default constructed using **flower_amqp_password**)
-   **flower_broker_api**: the full connection URL when connecting to RabbitMQ admin
    (defaults to constructed URL using **flower_amqp_admin_password**)
-   **edd_broker_url**: the full connection URL when connecting to RabbitMQ
    (defaults to consturcted URL using **flower_amqp_password**)

---

[1]: http://flower.readthedocs.io/en/latest/
[2]: http://www.celeryproject.org/
[3]: ../rabbitmq/README.md
