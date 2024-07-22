from . import *  # noqa: F403
from . import env

# override cache settings when running tests
if "CACHE_TEST_URL" in env.ENVIRON:
    CACHES = {"default": env.cache(var="CACHE_TEST_URL")}

# always use memory storage for tests
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "edd.load": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "edd.setup": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "edd.utilities.StaticFilesStorage"},
}
