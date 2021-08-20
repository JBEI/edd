import base64
import collections
import os
from distutils.util import strtobool

import environ
import invoke

env = environ.Env()

# what this file should help do:
# - make sure there is a ./secrets directory with appropriate passwords set
# - make sure there is a docker-compose.override.yml
# - choose external connections for services or bundled


def prompt_yesno(prompt):
    """Display prompt text and get user input as a boolean."""
    try:
        response = input(f"{prompt} (y/N) ") or "n"
        return strtobool(response)
    except Exception:
        return False


def password(bytelen, urlsafe=True):
    """Create a random password by base64-encoding bytelen random bytes."""
    raw = os.urandom(bytelen)
    if urlsafe:
        b64 = base64.urlsafe_b64encode(raw)
    else:
        b64 = base64.b64encode(raw)
    return b64.decode("utf-8")


# create a temporary directory name to hold all output files
output_dir = "/tmp/edd-config"


class ServiceDefinition:
    def __init__(self, context, name):
        """
        Initializes a service definition.

        :param context: the invoke context
        :param name: the service name
        """
        self.context = context
        self.name = name

        self._properties = []
        self._secrets = {}

    def build(self):
        """Collect writes from methods below, add to script to send to yq"""
        if self._secrets:
            env_file = self.write_secret_file(
                f"{self.name}.env",
                (f"{key}={value}" for key, value in self._secrets.items()),
            )
            self.write_service_property("env_file", env_file)
        if self._properties:
            # writing to temporary script file
            # using in-memory stream is slow
            # because invoke ends up reading one byte at a time
            # and sleeps between each read
            script_file = f"/tmp/{self.name}.script"
            with open(script_file, "w") as script:
                for key, value in self._properties:
                    print(f"{key}: {value}", file=script)
            self.context.run(
                f"yq w -s {script_file} -i {self.filename}",
                echo=True,
                echo_stdin=False,
            )
            os.remove(script_file)
        return self

    def expose_port(self, container, host=None):
        """
        Specify a port on the service to expose.

        :param container: the container port to expose
        :param host: the host port to bind; if None, use ephemeral port (default)
        """
        if host is None:
            self.write_service_property("ports[+]", f"'{container}'")
        else:
            self.write_service_property("ports[+]", f"'{host}:{container}'")

    @property
    def filename(self):
        return f"service/{self.name}.yml"

    def proxy(self, domain, port, contact=None):
        """
        Add configuration to proxy the service using a domain name.

        :param domain: the domain used to proxy
        :param contact: if set, the contact email for Let's Encrypt
        """
        self.write_service_property("networks[+]", "proxynet")
        self.write_env("VIRTUAL_HOST", domain)
        self.write_env("VIRTUAL_PORT", port)
        if contact:
            self.write_env("LETSENCRYPT_HOST", domain)
            self.write_env("LETSENCRYPT_EMAIL", contact)
        else:
            self.write_env("HTTPS_METHOD", "noredirect")

    def volume(self, spec):
        """Add configuration to include a volume."""
        self.write_service_property("volumes[+]", spec)
        return self

    def write_env(self, key, value):
        self.write_service_property(f"environment.{key}", value)
        return self

    def write_property(self, key, value):
        self._properties.append((key, value))
        return self

    def write_secret(self, key, value):
        self._secrets[key] = value
        return self

    def write_secret_file(self, path, content):
        relative_path = f"secrets/{path}"
        full_path = f"{output_dir}/{relative_path}"
        with open(full_path, mode="w") as out:
            if isinstance(content, (str, bytes)):
                print(content, file=out)
            else:
                for line in content:
                    print(line, file=out)
        return f"./{relative_path}"

    def write_service_property(self, key, value):
        return self.write_property(f"services.{self.name}.{key}", value)


class ServiceComposer:
    def __init__(self, context):
        # store the invoke context, for running commands, etc.
        self.context = context
        # track services by name, defaulting to False
        # set to instance of ServiceDefinition if in use
        self.services = collections.defaultdict(lambda: False)
        # track URL strings for services by name
        self.urls = {}
        # create temporary directory for output files
        self._prepare_filesystem()
        # create secret value for Django
        django_secret = password(63)
        # pre-define core services
        user = env("EDD_USER")
        mail = env("EDD_EMAIL")
        # each using Django secret and name/mail env params
        for service_name in ("http", "websocket", "worker"):
            service = self.define(service_name)
            service.write_env("EDD_USER", user)
            service.write_env("EDD_EMAIL", mail)
            service.write_secret("SECRET_KEY", django_secret)

    def _prepare_filesystem(self):
        # make sure temp directory is set up to write
        # both docker-compose.override.yml and secrets directory
        os.makedirs(f"{output_dir}/secrets", exist_ok=True)

    def core(self, *, dev=False, expose=False, proxy=False, settings=True, tls=False):
        print("Configuring core")
        http = self.services["http"]
        websocket = self.services["websocket"]
        worker = self.services["worker"]
        # add ports property when exposing ports
        if expose:
            http.expose_port(8000, 8000)
            websocket.expose_port(8000, 8001)
        if proxy:
            contact = env("EDD_EMAIL") if tls else None
            if proxy is True:
                domain = env("EDD_DOMAIN", default="edd.lvh.me")
            else:
                domain = proxy
            http.proxy(domain, 8000, contact)
            websocket.proxy(domain, 8000, contact)
        if dev:
            home = env("EDD_DIR")
            http.volume(f"{home}/server:/code")
            websocket.volume(f"{home}/server:/code")
            worker.volume(f"{home}/server:/code")
        if settings:
            home = env("EDD_DIR")
            http.volume(f"{home}/settings:/etc/edd:ro")
            websocket.volume(f"{home}/settings:/etc/edd:ro")
            worker.volume(f"{home}/settings:/etc/edd:ro")
        if tls:
            # just assume production if giving a real domain w/ TLS
            http.write_env("EDD_DEPLOYMENT_ENVIRONMENT", "PRODUCTION")
            websocket.write_env("EDD_DEPLOYMENT_ENVIRONMENT", "PRODUCTION")
            worker.write_env("EDD_DEPLOYMENT_ENVIRONMENT", "PRODUCTION")
        return self

    def define(self, name):
        service = ServiceDefinition(self.context, name)
        self.services[name] = service
        return service

    def setup_ice(self, url=None, hmac=None):
        print("Configuring ice")
        # bundle ice when no url provided
        if url is None:
            ice = self.define("ice")
            url = "http://ice:8080/"
            db_password = password(18)
            ice.write_property(
                "services.ice_db.environment.POSTGRES_PASSWORD", db_password
            )
            opts = [
                "-Dice.db.url=jdbc:postgresql://ice_db/ice",
                "-Dice.db.user=iceuser",
                f"-Dice.db.pass={db_password}",
            ]
            ice.write_env("CATALINA_OPTS", " ".join(opts))
            # existing HMAC code depends on canonical base64 encoding
            # cannot use the urlsafe variants
            hmac = password(63, urlsafe=False)
            hmac_name = "edd_ice_key"
            ice.write_env("ICE_HMAC_SECRETS", f"{hmac_name}:edd")
            ice.write_secret_file(hmac_name, hmac)
            ice.expose_port(8080, 8080)
            ice.proxy("ice.lvh.me", 8080)
        # update http and worker services to use configured ice
        for service_name in ("http", "worker"):
            service = self.services[service_name]
            if hmac:
                service.write_secret("ICE_HMAC_KEY", hmac)
            service.write_env("ICE_NAME", "edd")
            service.write_env("ICE_URL", url)

    def setup_letsencrypt(self):
        print("Configuring letsencrypt")
        # only necessary to define services
        # configuration auto-discovered via Docker APIs
        self.define("nginx")
        self.define("letsencrypt")
        return self

    def setup_nginx(self):
        print("Configuring nginx")
        # only necessary to define service
        # configuration auto-discovered via Docker APIs
        self.define("nginx")
        return self

    def setup_postgres(self, url=None):
        print("Configuring postgres")
        if url:
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                service.write_secret("DATABASE_URL", url)
                service.write_secret("CELERY_RESULT_BACKEND", f"db+{url}")
            self.urls.update(postgres=url)
        else:
            postgres = self.define("postgres")
            # create edduser password to postgres
            db_password = password(18)
            postgres.write_secret("POSTGRES_PASSWORD", db_password)
            # add db URLs to other services
            db_url = f"postgresql://edduser:{db_password}@postgres:5432/edd"
            celery = f"db+postgresql://edduser:{db_password}@postgres:5432/edd"
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                service.write_secret("DATABASE_URL", db_url)
                service.write_secret("CELERY_RESULT_BACKEND", celery)
        return self

    def setup_rabbitmq(self, url=None):
        print("Configuring rabbitmq")
        if url:
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                service.write_secret("BROKER_URL", url)
            self.urls.update(rabbitmq=url)
        else:
            rabbitmq = self.define("rabbitmq")
            # create edduser password to rabbitmq
            queue_password = password(18)
            rabbitmq.write_secret("RABBITMQ_DEFAULT_PASS", queue_password)
            queue_url = f"amqp://edduser:{queue_password}@rabbitmq:5672/edd"
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                service.write_secret("BROKER_URL", queue_url)
        return self

    def setup_redis(self, url=None):
        print("Configuring redis")
        if url:
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                # might be credentials in passed URL
                service.write_secret("CACHE_URL", url)
            self.urls.update(redis=url)
        else:
            self.define("redis")
        return self

    def setup_smtp(self, url=None):
        print("Configuring mail")
        if url:
            print("NOTE: EDD does not currently support simple SMTP config via URL.")
            print("Must manually overwrite Django mail settings in settings directory.")
            self.urls.update(smtp=url)
        else:
            self.define("smtp")
        return self

    def setup_solr(self, url=None):
        print("Configuring solr")
        if url:
            for service_name in ("http", "websocket", "worker"):
                service = self.services[service_name]
                if not service:
                    raise ValueError(f"Core service {service_name} not configured")
                # might be credentials in passed URL
                service.write_secret("SEARCH_URL", url)
            self.urls.update(solr=url)
        else:
            self.define("solr")
        return self

    def write_configs(self):
        core_names = ["http", "websocket", "worker"]
        support_names = ["postgres", "rabbitmq", "redis", "smtp", "solr"]
        optional_names = ["ice", "letsencrypt", "nginx"]
        configured = []
        for name in core_names:
            service = self.services[name]
            if not service:
                raise ValueError(f"Core service {name} not configured")
            configured.append(service.build().filename)
        for name in support_names:
            service = self.services.get(name, None)
            if name in self.urls:
                # defined external service, do nothing
                pass
            elif service:
                # defined bundled service, add to list
                configured.append(service.build().filename)
            else:
                # oops, missed support service, raise error
                raise ValueError(f"Support service {name} not configured")
        for name in optional_names:
            service = self.services[name]
            if service:
                configured.append(service.build().filename)
        to_merge = " ".join(configured)
        override_file = f"{output_dir}/docker-compose.override.yml"
        self.context.run(
            f"yq m -a {to_merge} > {override_file}", echo=True, echo_stdin=False,
        )
        return self


def enforce(name, param):
    """
    Enforces a truthy value for an environment / parameter name.
    The passed parameter takes precedence over the environment value.
    """
    if param:
        value = param
    else:
        value = env(name, default=param)
    if value is None:
        raise ValueError(f"No environment set for {name}")
    return value


@invoke.task
def offline(
    context,
    bundle=True,
    deploy=None,
    ice=None,
    postgres=None,
    rabbitmq=None,
    redis=None,
    smtp=None,
    solr=None,
):
    """
    Run setup stand-alone and fail if any info is missing.

    From the readme use-cases:
    1. invoke offline --no-bundle;
       either set environment: EDD_ICE, EDD_POSTGRES, EDD_RABBITMQ,
       EDD_REDIS, EDD_SMTP, EDD_SOLR; or add flags individually
    2. invoke offline;
    3. invoke offline --deploy=local;
    4. invoke offline --deploy=dev;
    5. invoke offline --deploy=[DOMAIN];
    """
    # create composer object to write configs
    composer = ServiceComposer(context)

    # Use-case #1
    if not bundle:
        # raise error if any service has no connection URL
        # use bundled anyway if flag argument is empty string
        postgres = enforce("EDD_POSTGRES", postgres)
        rabbitmq = enforce("EDD_RABBITMQ", rabbitmq)
        redis = enforce("EDD_REDIS", redis)
        smtp = enforce("EDD_SMTP", smtp)
        solr = enforce("EDD_SOLR", solr)

    # Use-case #2 becomes base-case
    # either an external service is used
    # or a bundled service is created
    composer.setup_postgres(postgres)
    composer.setup_rabbitmq(rabbitmq)
    composer.setup_redis(redis)
    composer.setup_smtp(smtp)
    composer.setup_solr(solr)

    # below section goes in "reverse" order of use-cases
    # Use-case #4 implies use-case #3 AND not #5;
    # Use-case #5 implies use-case #3 AND not #4;
    if deploy == "dev":
        # domain = "{service}.lvh.me"
        composer.setup_nginx()
        composer.setup_ice()
        composer.core(expose=True, proxy=True, dev=True)
    elif deploy == "local":
        # domain = "{service}.lvh.me"
        composer.setup_nginx()
        composer.core(expose=False, proxy=True)
    elif deploy is not None:
        # domain = letsencrypt
        composer.setup_letsencrypt()
        composer.core(expose=False, proxy=deploy, tls=True)
    else:
        composer.core(expose=True, proxy=False)

    composer.write_configs()

    # TODO: maybe configuration with doing tarball output?
    result = f"{output_dir}.tgz"
    context.run(
        f"tar -czf {result} -C {output_dir} .", echo=True, echo_stdin=False,
    )


# TODO: finish this @invoke.task
def interactive(context):
    """
    Prompt on command line for any missing info for setup.

    NOTE: This operation mode is not yet complete.
    """
    name = env("EDD_USER", default=None)
    if name is None:
        name = input("Name of EDD Administrator: ")
    mail = env("EDD_EMAIL", default=None)
    if mail is None:
        mail = input("Email of EDD Administrator: ")
    domain = env("EDD_DOMAIN", default=None)
    if domain is None:
        domain = input("Domain running EDD: ")
    services = [
        "ice",
        "letsencrypt",
        "nginx",
        "postgres",
        "rabbitmq",
        "redis",
        "smtp",
        "solr",
    ]
    include = {
        service: prompt_yesno(f"Bundle service for {service}?") for service in services
    }

    # TODO: check prereqs
    # e.g. no point adding letsencrypt without adding nginx

    # merge all services to make override file
    yaml = " ".join(f"{service}.yml" for service, yes in include.items() if yes)
    print(yaml)
    # yq m compose.yml {yaml} > docker-compose.override.yml
