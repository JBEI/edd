# Celery Distributed Task Queue Configuration

This document covers the various install and configuration instructions to run Celery/RabbitMQ.
Per the [documentation][1], celery is

    … a simple, flexible and reliable distributed system to process vast amounts of messages,
    while providing operations with the tools required to maintain such a system. It’s a task
    queue with focus on real-time processing, while also supporting task scheduling.

## Contents
* [External Resources](#External)
* [System Pre-requisites](#Prereq)
    * [Mac OS X](#OSX)
    * [Debian](#Debian)
        * [Follow EDD Instructions](#Debian_EDD)
        * [Install anc Configure RabbitMQ backend](#Debian_RabbitMQ)
        * [Install Celery as a daemon](#Debian_Celery)
        * [Install Flower as a daemon](#Debian_Flower)
    * [Common Configuration Steps][#Common_Configuration]
	    * [Configure the running RabbitMQ Server][#Configure_Rabbit]

---------------------------------------------------------------------------------------------------

<a name="External"/>
For reference, see:

* the RabbitMQ [Production Checklist][2]
* the Celery [security configuration][3]
* the Celery [configuration reference][4]

Many possible clustering, exchange, queue, worker, and back-end configurations are possible, and
will depend on the volume and resource requirements of EDD's traffic. Sample configuration below
sets up a single exchange, queue, and worker for EDD, using a PostgreSQL back end. Use custom
configuration and modify EDD's celeryconfig.py to fit your environment, using `remote_task.py` as
a reference for all of the tasks EDD schedules on Celery workers. Also consider enabling SSL on
RabbitMQ, Celery, and Flower, depending on whether all of the above, as well as any linked ICE
instance, are hosted on a single trusted network.


## System Pre-requisites <a name="Prereq"/>
This document will assume some basic knowledge of POSIX concepts; files, directories, users, 
permissions, processes, etc.


### Mac OS X <a name="OSX"/>
Celery will work out-of-the-box with the Docker Compose workflow.

<a name="Debian"/>

### Debian

<a name="Debian_EDD"/>

* Follow EDD Instructions
    * You should, at a minimum, set up the development environment as explained in the core EDD
      documentation. In particular, you will need the following sections:
        * Required Debian Packages
		* virtualenvwrapper
        * Python packages
    * TODO: any additional Debian package needed
    * Additional pip dependencies for Celery are included in the requirements.txt accompanying
      this document.
* Install and Configure RabbitMQ backend <a name="Debian_RabbitMQ"/>
    * References
        * [RabbitMQ Debian Install][6]
        * [RabbitMQ Production Checklist][2]
        * [Configure RabbitMQ for SSL][10]
    * Configure environment
        * Ensure shell environment has path set up; e.g. your `.bashrc` contains
          `export PATH=$PATH:/usr/sbin`
    * Install `rabbitmq-server` via `apt`
        * If you don't know what the above means, *please* [let a sysadmin do it][7]
        * Update `/etc/apt/sources.list` to reference RabbitMQ servers
        * Import rabbitmq.com certificate per RabbitMQ's install directions
        * Install RabbitMQ. List the version number to get the up-to-date version from RabbitMQ instead of the older one available from Debian (order of sources.list doesn't seem to matter for this).
	        apt-get install rabbitmq-server=3.5.6-1
    * TODO: `pip install -r` in virtualenv, how to get RabbitMQ/Celery to use virtualenv?
    * Configure 
    * TODO: follow same steps as OS X 'Start the RabbitMQ Server' and 'Set up the server'; should
      be its own linked section
        * final step to modify config to listen to localhost should use:

            sudo cp /usr/share/doc/rabbitmq-server/rabbitmq.config.example.gz /etc/rabbitmq/rabbitmq.config.gz
            cd /etc/rabbitmq/
            gunzip rabbitmq.config.gz
            sudo chown rabbitmq rabbitmq.config
            sudo chmod o-r rabbitmq.config
            sudo vim rabbitmq.config

* Install Celery as a daemon <a name="Debian_Celery"/>
    * References
        * [Running the Worker as a daemon][9]
        * [Message Signing][11]
        * [Logging and Intrusion Detection][14]
    * `sudo useradd -r celery`
	* `sudo usermod -a -G www-data celery` allows celery user to access /var/log/edd/query.log, which it will write to if running on the same VM as EDD
    * `sudo cp ./celery/debian/edd_celeryd.script /etc/init.d/edd_celeryd`
    * `sudo cp ./celery/debian/edd_celeryd.config /etc/default/edd_celeryd`
	* `sudo vi /etc/default/edd_celeryd`
    * `service edd_celeryd start`

* Install Flower as a daemon <a name="Debian_Flower"/>
    * References
        * [Configuration Options][12]
        * [Persistent Mode][13]
    * TODO

### Common Configuration Steps <a name="Common_Configuration"/>

* Configure the running RabbitMQ server <a name="Configure_Rabbit"/>
    * Remove default `guest` account: `rabbitmqctl delete_user guest`
    * Add a virtual host for EDD: `rabbitmqctl add_vhost /edd`
    * Create a limited account for EDD
        * Avoid special characters as the password is provided via URL
            * If you do use special characters, understand how shell quoting works first
        * Add the password to EDD's `server.cfg` as the `rabbitmq.edd_pass` parameter
        * `rabbitmqctl add_user edd_user <EDD_RABBITMQ_PASS>`
        * `rabbitmqctl set_permissions -p /edd edd_user ".*" ".*" ".*"`
        * More information about [access control][5]
    * Create an admin account for Flower
        * Avoid special characters as the password is provided via URL
            * If you do use special characters, understand how shell quoting works first
        * Add the password to EDD's `server.cfg` as the `rabbitmq.mgmt_pass` parameter
        * `rabbitmqctl add_user bunny <RABBITMQ_PASS>`
        * `rabbitmqctl set_permissions -p / bunny ".*" ".*" ".*"`
        * `rabbitmqctl set_permissions -p /edd bunny ".*" ".*" ".*"`
		* `sudo rabbitmqctl set_user_tags bunny administrator`
        * TODO: experiment with access controls to find minimum permissions necessary
    * Modify RabbitMQ configuration to listen only on localhost
        * Copy and modify configuration file `rabbitmq.config.example` to `rabbitmq.config`
		   * OSX: it's in `/usr/local/etc/rabbitmq`
		   * Debian: it's in `/etc/rabbitmq/rabbitmq.config`
        * Find the first occurance of "localhost" and add lines following the example comment
          that will cause RabbitMQ to ignore all remote requests

            %% Disable all remote access to RabbitMQ
            {tcp_listeners, [{"127.0.0.1", 5672},
                             {"::1",       5672}]}

        * Search the file for "loopback" and uncomment the line, adding the edd_user

            %% only allow edd_user access from localhost
            {loopback_users, [<<"guest">>, <<"edd_user">>]}


[1]:  https://celery.readthedocs.org/en/latest/index.html "Celery Documentation"
[2]:  https://www.rabbitmq.com/production-checklist.html
[3]:  http://celery.readthedocs.org/en/latest/configuration.html#security
[4]:  http://celery.readthedocs.org/en/latest/configuration.html
[5]:  https://www.rabbitmq.com/access-control.html
[6]:  https://www.rabbitmq.com/install-debian.html
[7]:  mailto:jbei-help@lbl.gov
[8]:  http://flower.readthedocs.org/en/latest/auth.html
[9]:  http://celery.readthedocs.org/en/latest/tutorials/daemonizing.html
[10]: https://www.rabbitmq.com/ssl.html
[11]: http://celery.readthedocs.org/en/latest/userguide/security.html#message-signing
[12]: http://flower.readthedocs.org/en/latest/config.html#options
[13]: http://flower.readthedocs.org/en/latest/config.html#persistent
[14]: http://celery.readthedocs.org/en/latest/userguide/security.html#logs
