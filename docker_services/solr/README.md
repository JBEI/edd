# jbei/solr:7.3

This Dockerfile builds an image to run the [Solr][1] search platform, based on the official
[version 7.3][2] image. The image is customized to load in a copy of the document schemas used
by [EDD][3] search, and adds a healthcheck script to execute PING on all search cores.

---------------------------------------------------------------------------------------------------


[1]:    http://lucene.apache.org/solr/
[2]:    https://hub.docker.com/_/solr/
[3]:    ../../README.md
