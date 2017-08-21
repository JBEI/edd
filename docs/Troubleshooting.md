# Troubleshooting

Like any complex system, the EDD will sometimes fail to behave as expected. The steps listed in
this document can help narrow down where a fault is occurring, and assist in fixing any problems.

* __Check container status__
  Run `docker ps -a` to get a listing of every container and its current state. If the `STATUS`
  column in this output has `(unhealthy)` listed after the uptime, that container should be
  investigated to find why healthchecks are failing. More information can be found by running
  `docker inspect {CONTAINER-ID}` and/or `docker logs {CONTAINER-ID}`.

* __Force removing containers__
  Some containers may not properly exit and clean up after themselves. These containers will show
  with an `Exited` status. These can be removed with `docker rm {CONTAINER-ID}`. To remove _all_
  containers, run `docker ps -aq | xargs docker rm`.

* __Force removing volumes__
  Docker Volumes containing stale data can sometimes cause problems launching containers. You can
  see a listing of all Volumes with `docker volume ls`. The list can be limited to Volumes not
  currently attached to a container with `docker volume ls -f 'dangling=true'`. Anonymous Volumes
  will have a 64-character hexdecimal hash as a name; EDD will generate several Volumes with names
  like `{PROJECT}_{SERVICE}data`, `eddmedia_{TIMESTAMP}`, or `eddstatic_{TIMESTAMP}`.

  Volumes can be removed with `docker volume rm {VOLUME-NAME}`. _This will delete ALL data saved
  to the Volume and remove it!_ Use the `backup_volume.sh` if you want to recover any of this data.
  If the Redis service in the `edd` project is having problems, you could try stopping EDD, then
  running `docker volume rm edd_redisdata` before restarting EDD. To remove _all_ volumes, run
  `docker volume ls -q | xargs docker volume rm`.

* __Pull or Build updated images__
  See the currently installed Docker Images with `docker images`. Run `docker-compose pull` to
  check Docker Hub for updated versions of images, or `docker-compose build` to rebuild images
  from Dockerfiles. Clean up older/unused images with `docker rmi {IMAGE-ID}` and remove all
  unused images with `docker images -qf 'dangling=true' | xargs docker rmi`.

* __View logs__
  Check the log output for containers with `docker logs {CONTAINER-ID}` or
  `docker-compose logs {SERVICE-NAME}`.
