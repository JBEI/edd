# exim4 1.0-edd

This Dockerfile builds an image to run the [Exim][1] SMTP server and message transfer agent (MTA).
It launches an exim daemon under [tini][2] with very basic configuration, and runs a healthcheck
to verify the daemon will accept messages originating from the `edd` service of [EDD][3].

---------------------------------------------------------------------------------------------------

[1]:    http://www.exim.org/
[2]:    https://github.com/krallin/tini
[3]:    ../README.md
