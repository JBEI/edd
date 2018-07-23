# coding: utf-8

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from jbei.rest.clients.edd.api import (
    DEFAULT_PAGE_SIZE,
    PAGE_NUMBER_URL_PARAM,
    PAGE_SIZE_QUERY_PARAM,
)


class ClientConfigurablePagination(PageNumberPagination):
    """
    Overrides defaults to enable client-configurable control (up to a limit) of result pagination
    by EDD's REST API. Note that specific REST views may override this behavior. See REST_FRAMEWORK
    setting in edd.settings.py.
    """
    page_size = DEFAULT_PAGE_SIZE
    page_size_query_param = PAGE_SIZE_QUERY_PARAM
    page_query_param = PAGE_NUMBER_URL_PARAM
    max_page_size = 10000


class LinkHeaderPagination(ClientConfigurablePagination):
    """
    Uses same configuration as ClientConfigurablePagination / DRF PageNumberPagination; but uses
    HTTP Link Header values to convey
    """
    def get_paginated_response(self, data):
        next_url = self.get_next_link()
        prev_url = self.get_previous_link()
        links = []
        headers = {}
        if prev_url:
            links.append(f'<{prev_url}>; rel="prev"')
        if next_url:
            links.append(f'<{next_url}>; rel="next"')
        if links:
            headers['Link'] = ', '.join(links)
        return Response(data, headers=headers)
