# -*- coding: utf-8 -*-

import logging

from django.conf import settings
from django_redis import get_redis_connection
from uuid import uuid4


logger = logging.getLogger(__name__)


class LatestViewedStudies(object):
    """ Interfaces with Redis to keep a list of latest viewed studies """

    def __init__(self, user, n=5, *args, **kwargs):
        super(LatestViewedStudies, self).__init__(*args, **kwargs)
        self._end = n - 1
        self._redis = get_redis_connection(settings.EDD_LATEST_CACHE)
        self._user = user

    def __iter__(self):
        return map(self._decode, iter(self._redis.lrange(self._key(), 0, self._end)))

    def _key(self):
        return '%(module)s.%(klass)s:%(user)s' % {
            'module': __name__,
            'klass': self.__class__.__name__,
            'user': self._user.username,
        }

    def _decode(self, value):
        return value.decode('utf-8')

    def remove_study(self, study):
        key = self._key()
        if study:
            self._redis.lrem(key, 0, study.pk)

    def viewed_study(self, study):
        key = self._key()
        if study:
            # Don't want to put duplicates in the list
            self._redis.lrem(key, 0, study.pk)
            # Push study pk to front of list
            self._redis.lpush(key, study.pk)
            # Trim list to size
            self._redis.ltrim(key, 0, self._end)


class ScratchStorage(object):
    """ Interfaces with Redis to keep scratch storage """

    def __init__(self, *args, **kwargs):
        super(ScratchStorage, self).__init__(*args, **kwargs)
        self._redis = get_redis_connection(settings.EDD_LATEST_CACHE)

    def _key(self, name=None):
        return '%(module)s.%(klass)s:%(name)s' % {
            'module': __name__,
            'klass': self.__class__.__name__,
            'name': uuid4() if name is None else name,
        }

    def delete(self, key):
        self._redis.delete(key)

    def load(self, key):
        return self._redis.get(key)

    def save(self, data, name=None, expires=None):
        key = self._key(name)
        expires = 60 * 60 * 24 if expires is None else expires
        self._redis.set(key, data, nx=True, ex=expires)
        return key
