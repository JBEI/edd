# EDD nginx Configuration

The base `docker-compose.yml` file used to launch EDD by default has no webserver configured. A
basic setup is included in the default generated `docker-compose.override.yml` file, and is
described in this document. There are many other possible ways to setup EDD in an existing web
infrastructure, the section on [Alternate Stacks](#alternate) describes how to adapt EDD to your
web stack.

## Contents

-   [Launching nginx](#launch)
-   [docker-gen configuration template](#docker-gen)
-   [Let's Encrypt proxy companion](#letsencrypt)
-   [Alternate Stacks](#alternate)

## Launching nginx <a name="#launch"/>

There are two routes included to launch the basic `nginx` web stack for EDD. The first route uses
the `docker-compose.override.yml` file generated during initial setup to include container
definitions for the three containers used to run nginx and the Let's Encrypt update container. No
changes are required for this method, it should work out-of-the-box.

The second route assumes some familiarity with Docker networking and use of `docker-compose` or
`docker stack deploy`. The `docker-compose.yml` file in this directory can be used to launch the
three containers out-of-band. To use the second route, the service definitions added to the EDD
`docker-compose.override.yml` should be deleted or commented out; i.e. running the `init-config`
script with the `--nonginx` flag. In addition, the config here should update the definition of
`proxynet` to use a virtual network created with `docker network create`, and the EDD
`docker-compose.override.yml` should also be updated to define that virtual network.

Other methods of proxying HTTP requests, such as with Apache httpd, HAProxy, or Traefic, are
possible as well, but are out of scope for this documentation. See the _Alternate Stacks_ section
below for things to consider when using a different proxy.

## docker-gen configuration template <a name="#docker-gen"/>

EDD uses the [official nginx container][1], and a container running [docker-gen][2] handles
generating a config file based on the `nginx.tmpl` file in the `nginx-gen` directory. That file
uses the [Go template processor][3] to create an nginx configuration file to be imported by the
default nginx configuration. To use a different template, either patch/replace the `nginx.tmpl`
file, or change the `entrypoint` of the `nginx-gen` service to point to a different file.

The included template will find all containers with a `VIRTUAL_HOST` environment, and create nginx
`upstream` and `server` blocks to proxy incoming requests for those domains to the appropriate
container. If the container also has a `VIRTUAL_STATIC` environment, nginx will attempt to serve
static files mounted to `/usr/share/nginx/html/` before proxying to the container. If the
container has a `VIRTUAL_PATH_GROUP` environment, nginx will group that container under that path
for each hostname; e.g. any requests to `example.org/custom` will go to containers with `/custom`
as the value of `VIRTUAL_PATH_GROUP`.

Additionally, using a [modified docker-gen][8] base adds a shell command for `docker-label-sighup`.
With this modification, the template generation can notify any container(s) with a specified label
set. Instead of the `nginx-gen` container using command `-notify-sighup nginx`, it could use
`-notify "docker-label-sighup org.github.jrcs.letsencrypt_nginx_proxy_companion.nginx_proxy"`.

Any extra configuration for the `server` block of an nginx virtual host can be set by adding files
for each domain inside the `vhost.d` directory inside the nginx service directory, or modifying
the `default` file; the virtual host domain file will take precedence. For example, the `default`
file contains configuration to set the maximum request size to 10 megabytes, and file named
`internal-edd.companyname.com` is added to configure the maximum request size to 250 megabytes.
With these settings, requests coming to `edd.companyname.com` will be limited to 10 megabyte
requests, while requests coming to `internal-edd.companyname.com` can go up to 250 megabytes.

## Let's Encrypt proxy companion <a name="#letsencrypt"/>

EDD also uses a [proxy companion][4] container, to automatically request certificates from the
[Let's Encrypt][5] service. Any services that define a `LETSENCRYPT_HOST` and `LETSENCRYPT_EMAIL`
environment will check every hour for certificates expiring within 30 days. If no certificates or
expiring certificates are found, a creation/renewal request is started, and the certificates are
installed into nginx. The value of `LETSENCRYPT_HOST` should almost always be a subset of the
`VIRTUAL_HOST` value on the container.

## Alternate Stacks <a name="#alternate"/>

There are a handful of configuration options that should change to fit EDD into an existing or
alternate web stack.

1. **Open ports**: the base `docker-compose.yml` exposes port `8000` from the `edd` service to
   _other containers_. To use another proxy, either:
   _ map port 8000 to a port on the Docker host, e.g. `ports: ['0.0.0.0:8000:8000']`; or,
   _ publish a container to proxy using the Docker virtual network
2. **Static files**: Assets like icons, stylesheets, and Javascript are mounted into the `edd`
   service with a named Docker volume, `staticdata`. The definition of `staticdata` can be
   overwritten with another named volume; see the Docker documentation for `docker volume create`
   for more information on how to mount existing filesystems as a Docker volume. Alternately,
   the `local.py` Django settings can change the value of `STATICFILES_STORAGE` to use a different
   storage driver to use a CDN or cloud storage. See the [STATICFILES_STORAGE documentation][6]
   from the Django project.
3. **Media files**: Similar to static files, EDD includes an `attachdata` volume to store all
   uploaded files. Your options are to use an alternate named volume in place of `attachdata`, or
   alter the Django configuration to use a different storage backend, such as with the
   [django-storages project][7].

---

[1]: https://hub.docker.com/_/nginx/
[2]: https://github.com/jwilder/docker-gen
[3]: https://golang.org/pkg/text/template/
[4]: https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion
[5]: https://letsencrypt.org/
[6]: https://docs.djangoproject.com/en/dev/howto/static-files/deployment/#staticfiles-from-cdn
[7]: https://django-storages.readthedocs.io/en/latest/
