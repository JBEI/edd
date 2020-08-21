## Migrating EDD from 2.6.x to 2.7.0+

### S3 Storage

The 2.7.0 version of EDD introduces use of an S3-compatible storage backend for
static assets and media. EDD may continue running with local disk storage, with
no changes. If making use of the new storage backend, it is necessary to first
deploy EDD with prior storage settings, plus the settings for boto3 storage
from [Django Storages][1], and set `EDD_ENABLE_S3_MIGRATE = True`.

The local settings file should include a section looking something like this:

```python
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

---

[1]: https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html
