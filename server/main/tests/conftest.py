import environ
from django_redis import get_redis_connection
from pytest import fixture


@fixture(autouse=True, scope="session")
def use_testing_cache():
    """
    If the CACHE_TEST_URL environment is available, switch the cache / Redis
    backend to that URL.
    """
    env = environ.Env()
    if "CACHE_TEST_URL" in env.ENVIRON:
        # using alternative fixture value
        yield True
        # once all tests are done, connect to alternate cache and compact AOF
        redis = get_redis_connection("default")
        redis.bgrewriteaof()
    else:
        yield False


@fixture(autouse=True)
def clear_cache(settings, use_testing_cache):
    """
    Resets the Redis cache before and after a test. There is a small chance of
    collisions for cache keys between tests, that amplifies greatly when tests
    are run repeatedly. Clearing out everything, every time, eliminates any
    possibility of collisions not intended by the individual test.
    """
    if use_testing_cache:
        redis = get_redis_connection("default")
        redis.flushdb()
