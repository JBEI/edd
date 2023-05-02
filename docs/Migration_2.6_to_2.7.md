## Migrating EDD from 2.6.x to 2.7.0+

### S3 Storage

The 2.7.0 version of EDD introduces use of an S3-compatible storage backend for
static assets and media. EDD may continue running with local disk storage, with
no changes. If making use of the new storage backend, it is necessary to first
migrate existing media / attachment files from the existing storage to the new
storage backend.

If you have command-line access to the deployed environment, the easiest way to
migrate is to use the `mc` command-line tool. Using the Docker container, a
migration could run like so:

```bash
# on old host; replace ${ATTACHMENT_VOLUME} with volume name,
# i.e. edd_edd_attachments
docker pull minio/mc
docker run --rm -it \
    --entrypoint /bin/sh \
    -v ${ATTACHMENT_VOLUME}:/run/attachments \
    minio/mc
# inside the mc container
mc alias set minio ${MINIO_ADDRESS} ${ACCESS_KEY} ${SECRET_KEY}
# if bucket does not exist, create it!
mc mb minio/${BUCKET_NAME}
mc policy set download minio/${BUCKET_NAME}/static
mc policy set download minio/${BUCKET_NAME}/media
# mirror command may be repeated
# do a final sync before decommissioning old version deployment
mc mirror /run/attachments minio/${BUCKET_NAME}/media
```

If you do not have command-line access, and the S3 bucket is already
provisioned for you, you may use EDD itself to mirror files. First, deploy EDD
with prior storage settings, plus the settings for boto3 storage from [Django
Storages][1], and set `EDD_ENABLE_S3_MIGRATE = True`.

The local settings file should include a section looking something like this:

```python
import environ
env = environ.Env()
# ...
AWS_S3_ENDPOINT_URL = env("MINIO_URL")
AWS_S3_CUSTOM_DOMAIN = env("MINIO_PROXY_DOMAIN")
AWS_ACCESS_KEY_ID = env("MINIO_ACCESS_KEY")
AWS_SECRET_ACCESS_KEY = env("MINIO_SECRET_ACCESS_KEY")
AWS_STORAGE_BUCKET_NAME = env("MINIO_BUCKET")
# purposefully commented out!
# DEFAULT_FILE_STORAGE = "edd.utilities.S3MediaStorage"
STATICFILES_STORAGE = "edd.utilities.S3StaticStorage"
EDD_ENABLE_S3_MIGRATE = True
```

Then, in the admin site, there will be an action item
`(global) Migrate S3 Storage` on the Attachments model. Select any attachment,
then run this item, and existing media files will get migrated to the new
storage backend.

Once completed, uncomment the `DEFAULT_FILE_STORAGE` and remove the
`EDD_ENABLE_S3_MIGRATE` line in the local settings. Re-deploy EDD with these
settings, to begin serving media files from the S3 bucket instead of prior
storage (local Docker volume or host-mounted volume).

Note, because of how the EDD assets are built with Webpack, URLs for static
assets _must_ serve those assets with `/static/` as the root path. This can be
done by adding a vhost configuration file to Nginx like below. When the proxy
domain is a local development domain (e.g. `*.lvh.me`), additionally include
both `AWS_S3_SECURE_URLS = False` and `AWS_S3_URL_PROTOCOL = "http:"`.

```nginx
location /static/ {
    proxy_pass ${URL_OF_S3_BUCKET}/static/;
}
location /media/ {
    proxy_pass ${URL_OF_S3_BUCKET}/media/;
}
```

### Categories for Import / Data Loading

There are four types of Category pre-defined in the updated import in 2.7.0.
Choosing a Category limits the list of Protocols and Layouts available during
an import. While the built-in supported layouts of "Generic" and "Skyline" are
automatically assigned to each Category, there is no automatic assignment of
Protocols to Categories. As a result, it is impossible to progress beyond the
first step of an Import process; a Protocol must be selected to proceed, and no
valid Protocols are available to choose from.

To fix this, an administrator must edit the list of protocols available for
each category, in the admin site at `/admin/load/category/`. It is recommended
to add every available Protocol to the `Other` Category. The Protocols added to
`Metabolomics`, `Proteomics`, and `Transcriptomics` should be limited to those
individual -omics Protocols.

---

[1]: https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html
