from . import *  # noqa: F403
from . import env

# override cache settings when running tests
if "CACHE_TEST_URL" in env.ENVIRON:
    CACHES = {"default": env.cache(var="CACHE_TEST_URL")}
