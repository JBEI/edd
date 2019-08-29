# jbei/solr:8

This Dockerfile builds an image to run the [Solr][1] search platform, based on
the official [version 8][2] image. The image is customized to load in a copy of
the document schemas used by [EDD][3] search, and adds a healthcheck script to
execute PING on all search indices. The Solr instance will run in SolrCloud mode
with embedded ZooKeeper configuration service.

The directories in the `configsets` directory here are included in the image at
path `/opt/solr/configset.d/`, and get added to ZooKeeper in the container
entrypoint script. Mounting volumes inside this directory will also attempt
loading the mounted data as a ConfigSet at startup.

---------------------------------------------------------------------------------------------------


[1]:    http://lucene.apache.org/solr/
[2]:    https://hub.docker.com/_/solr/
[3]:    ../../README.md
