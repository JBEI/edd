# EDD nginx Configuration

The EDD uses a built-in nginx web server by default. This document describes some of the
configuration options for the server.

## Contents
* [docker-gen configuration template](#docker-gen)
* [Let's Encrypt proxy companion](#letsencrypt)


## docker-gen configuration template <a name="#docker-gen"/>

EDD uses the [official nginx container][1], and a container running [docker-gen][2] handles
writing a config file based on the `nginx.tmpl` file in this directory. That file uses the
[Go template processor][3] to create an nginx configuration file to be imported by the default
nginx configuration. To use a different template, either patch/replace the `nginx.tmpl` file, or
change the `entrypoint` of the `nginx-gen` service to point to a different file.

The included template will find all containers with a `VIRTUAL_HOST` environment, and create nginx
`upstream` and `server` blocks to proxy incoming requests for those domains to the appropriate
container. If the container also has a `VIRTUAL_STATIC` environment, nginx will attempt to serve
static files mounted to `/usr/share/nginx/html/` before proxying to the container.

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

--------------------------------------------------------------------------------

[1]:  https://hub.docker.com/_/nginx/
[2]:  https://github.com/jwilder/docker-gen
[3]:  https://golang.org/pkg/text/template/
[4]:  https://github.com/JrCs/letsencrypt-nginx-proxy-companion
[5]:  https://letsencrypt.org/

