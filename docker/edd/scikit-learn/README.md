## Scikit-learn base image

The Docker image defined in this directory is a python-base image with packages that take a long
time to build pre-installed. This is primarily `scikit-learn`, with dependencies `numpy` and
`scipy`; also included is `python-libsbml`, which otherwise would take 5-10 minutes to build.

The plan is to create images based on this Dockerfile versioned with year and month at regular
intervals, with incremental versions for bugfix and security updates. For example, with a
six-month interval, there could be images `18.08.0`, `19.02.0`, `19.08.0` for releases in
August 2018, February 2019, and August 2019. If there is a critical security update that happens
in March 2019, this image will update to `19.02.1`. The `latest` image will always point to the
most-recent version. The `yy.mm` images will always point to the newest version of the base in
that series; and the `yy.mm.x` images will be immutable.
