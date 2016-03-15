from rest_framework.pagination import PageNumberPagination


class ClientConfigurablePagination(PageNumberPagination):
    """
    Overrides defaults to enable client-configurable control (up to a limit) of result pagination
    by EDD's REST API. Note that specific REST views may override this behavior. See REST_FRAMEWORK
    setting in edd.settings.py.
    """
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 10000