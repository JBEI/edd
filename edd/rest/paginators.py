from rest_framework.pagination import PageNumberPagination

from jbei.edd.rest.edd import PAGE_SIZE_QUERY_PARAM, PAGE_NUMBER_QUERY_PARAM, DEFAULT_PAGE_SIZE


class ClientConfigurablePagination(PageNumberPagination):
    """
    Overrides defaults to enable client-configurable control (up to a limit) of result pagination
    by EDD's REST API. Note that specific REST views may override this behavior. See REST_FRAMEWORK
    setting in edd.settings.py.
    """
    page_size = DEFAULT_PAGE_SIZE
    page_size_query_param = PAGE_SIZE_QUERY_PARAM
    page_query_param = PAGE_NUMBER_QUERY_PARAM
    max_page_size = 10000