import collections
from builtins import enumerate
from builtins import isinstance
from builtins import len


def make_entry_url(ice_base_url, entry_id):
    return ('%(base_url)s/entry/%(local_part_id)d' %
        {
            'base_url': ice_base_url,
            'local_part_id': entry_id,
        })