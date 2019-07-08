# coding: utf-8
"""
Common code; defines serialization mixin.
"""

from django.db.models import Q


class EDDSerialize(object):
    """ Mixin class for EDD models supporting JSON serialization. """

    def get_attr_depth(self, attr_name, depth, default=None):
        # check for id attribute does not trigger database call
        id_value = getattr(self, f"{attr_name}_id", None)
        if id_value is not None:
            if depth > 0:
                return getattr(self, attr_name).to_json(depth=depth - 1)
            return id_value
        return default

    def to_json(self, depth=0):
        """
        Converts object to a dict appropriate for JSON serialization. If the depth argument
        is positive, the dict will expand links to other objects, rather than inserting a
        database identifier.
        """
        return {"id": self.pk, "klass": self.__class__.__name__}


def qfilter(value, fields=None):
    """
    Creates an optional filter; if the content of the value to filter by is None, return an empty
    filter term. Otherwise, chain together the field lookups and return a filter term for those
    fields with the given value. Do use when either the filter value is unknown or the list of
    chained field names has an unknown. If these conditions are not met, use regular syntax of
    queryset.filter(fieldA__fieldB=value).
    """
    if fields is None:
        fields = tuple()
    if value is not None:
        return Q(**{"__".join(fields): value})
    return Q()
