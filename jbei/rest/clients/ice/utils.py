# coding: utf-8
from __future__ import unicode_literals


def make_entry_url(ice_base_url, entry_id):
    return (
        '%(base_url)s/entry/%(local_part_id)d' %
        {
            'base_url': ice_base_url,
            'local_part_id': entry_id,
        }
    )
