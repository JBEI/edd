# coding: utf-8
from __future__ import unicode_literals

import urlparse


def build_entry_ui_url(ice_base_url, entry_id):
    """
    Builds the URL for client access to an ICE entry via ICE's user interface.
    :param ice_base_url: the base URL of the ICE instance (assumed to NOT end with a slash)
    :param entry_id: an ICE identifier for the part.  This can be any of 1) The UUID (preferred
    as universally unique), 2) The ICE part number (more likely, though not guaranteed to be
    universally unique, 3) The local ICE primary key for the part.
    Note that in *some* but not all cases, the numeric portion of the ICE part number corresponds
    to the local primary key.  This relationship isn't reliable across ICE instances,
    and shouldn't be depended on in software.
    :return: the URL
    """
    return (
        '%(base_url)s/entry/%(id)s' %
        {
            'base_url': ice_base_url,
            'id': entry_id,
        }
    )


def extract_id_from_ui_url(ice_part_ui_url):
    """
    Extracts an ICE identifier for a part from a valid ICE user interface URL.  Note that ICE's
    user interface accepts multiple different identifiers, so prior knowledge is needed to
    distinguish between the identifiers accepted.
    :param ice_part_ui_url:
    :return: the identifier
    """
    url_parts = urlparse.urlparse(ice_part_ui_url)
    url_path = url_parts.path
    elts = url_path.split('/')
    return elts[-1] if elts[-1] else elts[-2]
