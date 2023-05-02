# Linux / Debian Setup

This page contains directions for setting up EDD on Linux. Follow the
Docker-recommended instructions for [installing the daemon for your distro][1].
NOTE: there is a `docker` package in the Debian apt repos. It is not
[Docker][2]! There is a `docker.io` package too; this can work, but the
Debian-maintained packages will generally lag behind the official
Docker-maintained packages.

Test that Docker and Docker Compose are installed and running correctly by
executing `docker run --rm hello-world` and `docker compose`, respectively. The
former will print a welcome message similar to this:

```
Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
    (amd64)
 3. The Docker daemon created a new container from that image which runs the
    executable that produces the output you are currently reading.
 4. The Docker daemon streamed that output to the Docker client, which sent it
    to your terminal.

To try something more ambitious, you can run an Ubuntu container with:
 $ docker run -it ubuntu bash

Share images, automate workflows, and more with a free Docker ID:
 https://hub.docker.com/

For more examples and ideas, visit:
 https://docs.docker.com/get-started/
```

The latter should print usage information about the `docker compose` command.

Install [pre-commit][3], either directly with `pipx install pre-commit`, or use
the non-administrative install script:

```bash
curl https://pre-commit.com/install-local.py | python -
```

---

[1]: https://docs.docker.com/engine/installation/linux/
[2]: https://docker.io/
[3]: https://pre-commit.com/
