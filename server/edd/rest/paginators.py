from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class ClientConfigurablePagination(PageNumberPagination):
    """
    Overrides defaults to enable client-configurable control (up to a limit) of result
    pagination by EDD's REST API. Note that specific REST views may override
    this behavior.

    See REST_FRAMEWORK setting in edd.settings.py.
    """

    page_size = 30
    page_size_query_param = "page_size"
    page_query_param = "page"
    max_page_size = 10000


class LinkHeaderPagination(ClientConfigurablePagination):
    """
    Uses same configuration as ClientConfigurablePagination / DRF PageNumberPagination;
    but uses HTTP X-Total-Count and Link Header values to convey the count of records
    returned, and links to next/prev sets of data.
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
            headers["Link"] = ", ".join(links)
        headers["X-Total-Count"] = str(self.page.paginator.count)
        return Response(data, headers=headers)
