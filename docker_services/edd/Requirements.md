# Python Package Requirements

This document will attempt to maintain a record of the specific uses for Python packages listed
in the EDD [requirements.txt][1]. Dependencies for these packages can be generated using the
[`pipdeptree`][2] tool.

## Django

[Django][3] is the central web framework used by EDD. It is a dependency for multiple Django apps
used inside EDD, thus will not show up as a root dependency from `pipdeptree` output. Django
itself has only `pytz` as a dependency.

    Django==2.0.6
      pytz==2018.4

### Django Allauth

The [Allauth][6] Django application handles using external authentication sources. The JBEI Public
instance of EDD uses this to enable logins via Github, Google, and LinkedIn. Other sources can be
configured by following the Allauth documentation.

    django-allauth==0.36.0
      python3-openid==3.1.0
        defusedxml==0.5.0
      requests==2.19.0
        certifi==2018.4.16
        chardet==3.0.4
        idna==2.7
        urllib3==1.23
      requests-oauthlib==1.0.0
        oauthlib==2.1.0
        requests==2.19.0
          certifi==2018.4.16
          chardet==3.0.4
          idna==2.7
          urllib3==1.23

### Django Auth LDAP

The [Auth LDAP][7] Django application handles using an LDAP server for authentication and basic
directory services, e.g. groups. EDD uses this to enable logins with LBNL credentials.

    django-auth-ldap==1.6.1
      python-ldap==3.1.0
        pyasn1==0.4.3
        pyasn1-modules==0.2.1
          pyasn1==0.4.3

### Django Debug Toolbar

The [Django Debug Toolbar][8] is a development convenience. It inserts a debugging toolbar into
pages, listing information like the templates used to render the page, database queries run, time
to render, etc. This app could be removed for non-development deployments.

    django-debug-toolbar==1.9.1
      sqlparse==0.2.4

### Django Environ

The [Django Environ][9] library assists in creating more declarative Django settings based on
environment variables, for creating [12 Factor applications][10].

    django-environ==0.4.4
      six==1.11.0

### Django Extensions

The [Django Extensions][11] app adds in several additional Django management commands. This might
no longer be used in EDD.

    django-extensions==2.0.6
      six==1.11.0

### Django Messages Extends

Adds "sticky" and "persistent" messages to the default Django contrib messages package. Where
normal messages get displayed on only the following request, messages with these extended
features will remain until dismissed with session-scope and user-scope, respectively. Once the
WebSocket notification feature is added, this could remain as a fall-back mechanism or be removed.
[Source][12]

    django-messages-extends==0.6.0

### Django Redis

Simple driver to enable using Redis as a cache backend for Django.

    django-redis==4.9.0
      redis==2.10.6

### Django REST Framework

EDD's REST API is driven by the [Django REST Framework][13]. The framework adds endpoints,
serializers, controllers, etc. that integrate with the Django APIs, making defining REST APIs
from existing code as simple as possible. Like Django, the DRF also includes other "apps" with
further dependencies.

    djangorestframework==3.8.2

#### Django Filter

[Django Filter][14] is a Django app, mostly used here in the context of DRF. It extends the Django
ORM for use by a REST API to filter model objects.

    django-filter==1.1.0

#### Nested Routers (drf-nested-routers)

The [drf-nested-routers][16] library adds support for nested URL routes to the REST Framework, e.g.
allowing routing for lines like `/lines/{id}` to be nested under a routing for a specific study
like `/study/{id1}/lines/{id2}`.

    drf-nested-routers==0.90.2

#### SQLAlchemy

[SQLAlchemy][17] is an alternative Python ORM library; DRF uses it as part of its documentation
generator. Removing it will break things in DRF. The EDD itself only uses the Django ORM.

    SQLAlchemy==1.2.8

#### Django REST Swagger (deprecated?)

This app generates a Swagger browsable API from DRF's built-in documentation generator. The app is
no longer maintained, and is scheduled to be replaced with another OpenAPI-compliant documentation
generator soon. (Update 2018-06-12: this library has been updated, so is maybe maintained; still
may replace with a more active documentation generator based on OpenAPI)

    django-rest-swagger==2.2.0
      coreapi==2.3.3
        coreschema==0.0.4
          Jinja2==2.10
            MarkupSafe==1.0
        itypes==1.1.0
        requests==2.19.0
          certifi==2018.4.16
          chardet==3.0.4
          idna==2.7
          urllib3==1.23
        uritemplate==3.0.0
      djangorestframework==3.8.2
      openapi-codec==1.3.2
        coreapi==2.3.3
          coreschema==0.0.4
            Jinja2==2.10
              MarkupSafe==1.0
          itypes==1.1.0
          requests==2.19.0
            certifi==2018.4.16
            chardet==3.0.4
            idna==2.7
            urllib3==1.23
          uritemplate==3.0.0
      simplejson==3.15.0

### Django Threadlocals

The [Django threadlocals][18] adds a middleware class to attach the current request to a
threadlocal variable. This is generally considered to be a bad idea by the Django developers; EDD
is using it to handle loading only a single `Update` model instance per request. It is cleaner to
put the request into a threadlocal variable, rather than forcing a request to be passed around in
all of the other APIs in EDD. This library is not compatible with Django 2.0+, as it contains an
old-style middleware (`MIDDLEWARE_CLASSES` vs `MIDDLEWARE` setting). EDD extends the middleware to
make it compatible.

    django-threadlocals==0.8

## Arrow

[Arrow][4] is an improved datetime library, used in several locations in the EDD code to create
timestamps and handle durations between datetimes.

    arrow==0.12.1
      python-dateutil==2.7.0
        six==1.11.0

## Celery

[Celery][5] is a distributed task queue library. EDD uses Celery to schedule background tasks and
long-running tasks that could not complete within a normal timeout window for HTTP requests.

    celery==4.2.0
      billiard==3.5.0.3
      kombu==4.2.1
        amqp==2.3.2
          vine==1.1.4
      pytz==2018.4

## Channels

[Channels][6], aka Django Channels, is an extension to Django to allow for asynchronous handling
of web traffic. Specifially, EDD uses Channels to handle WebSocket connections, where a persistent
connection passes messages between the remote user and EDD, without resorting to long-polling.

    channels==2.1.1
      asgiref==2.3.2
        async-timeout==3.0.0
      daphne==2.1.2
        autobahn==18.6.1
          six==1.11.0
          txaio==2.10.0
            six==1.11.0
        Twisted==18.4.0
          Automat==0.6.0
            attrs==18.1.0
            six==1.11.0
          constantly==15.1.0
          hyperlink==18.0.0
            idna==2.7
          incremental==17.5.0
          zope.interface==4.5.0
            setuptools==39.2.0

### channels-redis

Parallel to Channels, this package handles using Redis as a backend and broker for messages
handled by Channels. It has Channels itself as a dependency, these are the other dependencies.

    channels-redis==2.2.1
      aioredis==1.1.0
        async-timeout==3.0.0
        hiredis==0.2.0
      asgiref==2.3.2
        async-timeout==3.0.0
      msgpack==0.5.6

## Testing

The following sub-headings all fall under libraries used to assist in running unit tests.

### Factory Boy

[Factory Boy][19] is a library used to assist in property-based testing and simplify generation of
objects to use in tests vs using fixtures.

    factory-boy==2.11.1
      Faker==0.8.15
        python-dateutil==2.7.3
          six==1.11.0
        six==1.11.0
        text-unidecode==1.2

## Graphene

[Graphene][27] implements the GraphQL API query language in Python. It runs the GraphQL endpoint
under development to drive the React-based UIs planned for imports.

    graphene==2.1.1
      aniso8601==3.0.0
      graphql-core==2.0
        promise==2.1
          six==1.11.0
          typing==3.6.4
        Rx==1.6.1
        six==1.11.0
      graphql-relay==0.4.5
        graphql-core==2.0
          promise==2.1
            six==1.11.0
            typing==3.6.4
          Rx==1.6.1
          six==1.11.0
        promise==2.1
          six==1.11.0
          typing==3.6.4
        six==1.11.0
      promise==2.1
        six==1.11.0
        typing==3.6.4
      six==1.11.0

### graphene-django

A Django integration for Graphene.

    graphene-django==2.0.0
      iso8601==0.1.12
      promise==2.1
        six==1.11.0
        typing==3.6.4
      singledispatch==3.4.0.3
        six==1.11.0
      six==1.11.0

## Gunicorn

[Gunicorn][21] is a production-ready Python WSGI HTTP server. It serves EDD's HTTP(S)-only traffic.

    gunicorn==19.8.1

## jsonpickle (deprecated)

This is a package used to serialize and deserialize Python objects for persistent storage. It is
currently only used in the old GC-MS parser utility, and could likely be replaced entirely with
the custom JSON encoder/decoder classes in EDD's main.utilities package.

    jsonpickle==0.9.6

#### jsonschema

[JSONSchema][15] is a library used to validate data serialized to JSON as conforming to a specific
schema layout. It is currently only used to check JSON data arriving from the combinatorial line
creation interface to EDD.

    jsonschema==2.6.0

## openpyxl

[OpenPyXL][22] is a library for parsing Excel files. It is used in multiple places to parse through
Excel files, e.g. in the importer, experiment description, etc.

    openpyxl==2.5.4
      et-xmlfile==1.0.1
      jdcal==1.4

## Pillow

[Pillow][23] is a library for manipulating images. It is used by the ImageField attributes on the
`edd.branding` app, and anywhere else that is using an ImageField.

## psycopg2-binary

This library is the PostgreSQL driver for the Django database connections.

## python-libsbml

This is a python wrapper around the [libSBML][26] library. EDD uses this to read SBML template
files and export 'omics data to SBML for use in Arrowland or modeling applications.

## rdflib

An RDF-parser library, used to parse the RDF ontology information UniProt returns for proteins.

## scikit-learn / SciPy / NumPy

Mathematics, Science, and Machine Learning libraries/utilities, used extensively in exporting data
to SBML.

## service-identity

This library ensures that the Python standard library urllib functions will properly validate
TLS certificates. [Source][25]

    service-identity==17.0.0
      attrs==18.1.0
      pyasn1==0.4.3
      pyasn1-modules==0.2.1
        pyasn1==0.4.3
      pyOpenSSL==18.0.0
        cryptography==2.2.2
          asn1crypto==0.24.0
          cffi==1.11.5
            pycparser==2.18
          idna==2.7
          six==1.11.0
        six==1.11.0

## watchdog

This adds a Python-based application to watch for changes to the filesystem. EDD uses this to
detect changes in TypeScript code, and copy the compiled files to the webserver serving static
files, using Django's `collectstatic` command. [Source][24]

---------------------------------------------------------------------------------------------------

[1]:    ./requirements.txt
[2]:    https://pypi.python.org/pypi/pipdeptree
[3]:    https://www.djangoproject.com/
[4]:    https://arrow.readthedocs.io/en/latest/
[5]:    https://www.celeryproject.org/
[6]:    https://django-allauth.readthedocs.io/en/latest/
[7]:    https://github.com/django-auth-ldap/django-auth-ldap
[8]:    https://django-debug-toolbar.readthedocs.io/en/stable/
[9]:    https://django-environ.readthedocs.io/en/latest/
[10]:   https://www.12factor.net/
[11]:   https://django-extensions.readthedocs.io/en/latest/
[12]:   https://github.com/AliLozano/django-messages-extends
[13]:   https://www.django-rest-framework.org/
[14]:   https://django-filter.readthedocs.io/en/1.1.0/
[15]:   https://python-jsonschema.readthedocs.io/en/latest/
[16]:   https://github.com/alanjds/drf-nested-routers
[17]:   https://www.sqlalchemy.org/
[18]:   https://github.com/benrobster/django-threadlocals
[19]:   https://factoryboy.readthedocs.io/en/latest/
[20]:   https://pypi.python.org/pypi/mock
[21]:   https://gunicorn.org/
[22]:   https://openpyxl.readthedocs.io/en/stable/
[23]:   https://pillow.readthedocs.io/en/latest/
[24]:   https://pythonhosted.org/watchdog/
[25]:   https://service-identity.readthedocs.io/en/stable/
[26]:   http://sbml.org/Software/libSBML
[27]:   http://graphene-python.org/
