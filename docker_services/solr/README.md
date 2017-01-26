# solr 5.5-edd

This Dockerfile builds an image to run the [Solr][1] search platform, based on the official
[version 5.5][2] image. The image is customized to load in a copy of the document schemas used
by [EDD][3] search, and to launch the Solr application under [tini][4] to handle any potential
zombie processes. It also adds a healthcheck script to execute PING on all search cores.

---------------------------------------------------------------------------------------------------


[1]:    http://lucene.apache.org/solr/
[2]:    https://hub.docker.com/_/solr/
[3]:    ../../README.md
[4]:    https://github.com/krallin/tini
