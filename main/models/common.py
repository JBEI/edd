# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Common code; defines serialization mixin.
"""


class EDDSerialize(object):
    """ Mixin class for EDD models supporting JSON serialization. """
    def get_attr_depth(self, attr_name, depth, default=None):
        # check for id attribute does not trigger database call
        id_attr = '%s_id' % attr_name
        if hasattr(self, id_attr) and getattr(self, id_attr):
            if depth > 0:
                return getattr(self, attr_name).to_json(depth=depth-1)
            return getattr(self, id_attr)
        return default

    def to_json(self, depth=0):
        """ Converts object to a dict appropriate for JSON serialization. If the depth argument
            is positive, the dict will expand links to other objects, rather than inserting a
            database identifier. """
        return {
            'id': self.pk,
            'klass': self.__class__.__name__,
        }
