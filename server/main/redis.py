import logging
from uuid import uuid4

from django.conf import settings
from django_redis import get_redis_connection

from .signals import study_viewed

logger = logging.getLogger(__name__)


class LatestViewedStudies:
    """ Interfaces with Redis to keep a list of latest viewed studies """

    def __init__(self, user, n=5, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._end = n - 1
        self._redis = get_redis_connection(settings.EDD_LATEST_CACHE)
        self._user = user

    def __iter__(self):
        return map(self._decode, iter(self._redis.lrange(self._key(), 0, self._end)))

    def _key(self):
        return f"{__name__}.{self.__class__.__name__}:{self._user.username}"

    def _decode(self, value):
        return value.decode("utf-8")

    def remove_study(self, study):
        key = self._key()
        if study:
            self._redis.lrem(key, 0, study.pk)

    def viewed_study(self, study):
        key = self._key()
        if study:
            # Don't want to put duplicates in the list
            removed_count = self._redis.lrem(key, 0, study.pk)
            # Push study pk to front of list
            self._redis.lpush(key, study.pk)
            # Trim list to size
            self._redis.ltrim(key, 0, self._end)
            # only signal a view if this user hasn't recently viewed the same study
            if removed_count == 0:
                study_viewed.send(
                    sender=self.__class__, study=study, user=self._user,
                )


class ScratchStorage:
    """ Interfaces with Redis to keep scratch storage """

    def __init__(self, key_prefix=None, **kwargs):
        """
        :param key_prefix: an optional prefix to prepend to all cache entries created by this
            ScratchStorage instance.
        """
        super().__init__(**kwargs)
        self._key_prefix = key_prefix
        if self._key_prefix is None:
            self._key_prefix = f"{__name__}.{self.__class__.__name__}"
        self._redis = get_redis_connection(settings.EDD_LATEST_CACHE)

    def _key(self, name):
        return f"{self._key_prefix}:{name}"

    def check_name(self, name):
        """
        Checks if a name is suitable to use; generates a name if not.

        :param name: proposed name
        :returns: the name to use
        """
        return str(uuid4()) if name is None else name

    def delete(self, *names):
        """
        Deletes data having keys with the specified names.

        :param ...names: one or more names to delete from storage
        :returns: the number of keys actually deleted
        """
        return self._redis.delete(*map(self._key, names))

    def load(self, name):
        """
        Loads data from the named key.

        :param name: name of the value returned from ScratchStorage.save()
        :returns: the data stored at the named key.
        """
        return self._redis.get(self._key(name))

    def save(self, data, name=None, expires=None):
        """
        Saves data to storage, with optional name and expiration. Note that subsequent calls to
        save() with the same name will *not* overwrite.

        :param data: the object to save
        :param name: (optional) the name to use for looking up the saved data later
        :param expires: (optional) number of seconds until the saved data will expire/delete;
            defaults to one day
        :returns: the name under which the data was saved
        """
        expires = 60 * 60 * 24 if expires is None else expires
        name = self.check_name(name)
        self._redis.set(self._key(name), data, nx=True, ex=expires)
        return name

    def expire(self, name, seconds):
        """
        Sets an expiration time on a named value, after which the stored data will be deleted.

        :param name: name of the value returned from ScratchStorage.save()
            or ScratchStorage.append()
        :param seconds: number of seconds until the saved data will expire/delete
        """
        self._redis.expire(self._key(name), seconds)

    def page_count(self, name):
        """
        Fetches the number of stored pages under the given name.

        :param name: name of the value returned from ScratchStorage.append()
        :returns: the number of pages stored under the name
        """
        return self._redis.llen(self._key(name))

    def load_pages(self, name):
        """
        Fetches the pages stored under the given name.

        :param name: name of the value returned from ScratchStorage.append()
        :returns: a generator of the stored values
        """
        yield from self._redis.lrange(self._key(name), 0, -1)

    def append(self, data, name=None, expires=None):
        """
        Adds a page of data to storage, with optional name and expiration.

        :param data: the object to save
        :param name: (optional) the name to use for looking up the saved page later
        :param expires: (optional) number of seconds until the saved data will expire/delete;
            defaults to one day
        :returns: the name under which the data was saved
        """
        expires = 60 * 60 * 24 if expires is None else expires
        name = self.check_name(name)
        with self._redis.pipeline() as pipe:
            pipe.rpush(self._key(name), data)
            pipe.expire(self._key(name), expires)
            result = pipe.execute()
        # (name, # of cache pages)
        return name, result[0]
