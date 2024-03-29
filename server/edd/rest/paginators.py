from rest_framework.pagination import BasePagination, PageNumberPagination
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


class ReplicatePagination(BasePagination):
    """
    A custom pagination that runs a double query to group together replicates.
    The returned page will contain `page_size` number of *replicates*, which
    may result in several more Line objects than `page_size`.
    """

    def __init__(self, wrapped):
        self.wrapped = wrapped

    def get_paginated_response(self, data):
        return self.wrapped.get_paginated_response(data)

    def paginate_queryset(self, queryset, request, view=None):
        keys = {k: None for k in queryset.values_list("replicate_key", flat=True)}
        subset = self.wrapped.paginate_queryset(list(keys.keys()), request, view)
        return list(queryset.filter(replicate_key__in=subset))
