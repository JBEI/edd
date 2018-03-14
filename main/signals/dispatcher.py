# -*- coding: utf-8 -*-

from itertools import product
from uuid import uuid4


_sentinel = object()


def receiver(signal, sender=None, dispatch_uid=_sentinel, **kwargs):
    """
    A better version of the django.dispatch.receiver decorator. Can handle lists or tuples in the
    sender kwarg, in addition to the signal argument. Will generate a dispatch_uid for each
    connect, unless None is explicitly passed in for dispatch_uid.
    """
    def _decorator(func):
        signal_list = signal if isinstance(signal, (list, tuple)) else [signal]
        sender_list = sender if isinstance(sender, (list, tuple)) else [sender]
        for sig, send in product(signal_list, sender_list):
            uid = uuid4() if dispatch_uid is _sentinel else dispatch_uid
            sig.connect(func, sender=send, dispatch_uid=uid, **kwargs)
        return func
    return _decorator
