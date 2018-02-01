import logging

from requests.packages.urllib3 import HTTPResponse

from jbei.rest.clients import IceApi
from jbei.rest.clients.ice.api import (VERIFY_SSL_DEFAULT, DEFAULT_RESULT_LIMIT, ICE_URL)
from .constants import FORBIDDEN

logger = logging.getLogger(__name__)


class IceTestStub(IceApi):
    """
       A variant of IceAPI that captures important test conditions for Experiment Description ICE
       queries and allows us to quickly do basic testing without having CI yet / putting more
       effort into automated tests. Note: code here is very simple, but actually took a while to
       find, since there as so many similarly named classes/options in requests, Django,
       etc that aren't well-documented.  This code is worth keeping until replaced with an
       automated test.
    """

    def __init__(self, auth, base_url=ICE_URL, result_limit=DEFAULT_RESULT_LIMIT,
                 verify_ssl_cert=VERIFY_SSL_DEFAULT):
        super(IceTestStub, self).__init__(auth, base_url=base_url, result_limit=result_limit,
                                          verify_ssl_cert=verify_ssl_cert)

        self._query_num = 0
        self._fail_on_query_num = 2  # set to nonzero to test failure/partial success!

    def get_entry(self, entry_id, suppress_errors=False):
        self._query_num += 1

        # if configured, work normally, deferring failure until the requested query #
        if self._query_num != self._fail_on_query_num:
            logger.debug('On query %d ...waiting to fail on #%d..' % (
                self._query_num, self._fail_on_query_num))
            return super(IceTestStub, self).get_entry(entry_id, suppress_errors=suppress_errors)

        # NOTE: all tests below assume the first-run case where ignore_ice_related_errors=False.
        # All the expected results still hold if it's False, except the response should always be
        #  200 (success)

        ###########################################################################################
        # Test condition 1:
        ###########################################################################################
        # Uncomment this block to test connection errors.
        #
        # Expected results to verify (manually for now):
        #    A) admin email sent (probably via an added log message...not working in DEV ATM)
        #    B) generic user-facing error message about ICE access problems
        #    C) 500 "internal server error" response (use Chrome's "network" develop tool)
        ###########################################################################################
        # raise requests.exceptions.ConnectionError()

        ###########################################################################################
        # Test condition 2:
        ###########################################################################################
        # Uncomment this block to test bad user data entry for part IDs
        #
        # Expected results to verify (manually for now):
        #    A) *NO* admin email sent (probably via an added log message...not working in DEV ATM)
        #    B) User error message lists parts that couldn't be found
        #    C) 404 "not found" response (use Chrome's "network" develop tool)
        ###########################################################################################
        # return None

        ###########################################################################################
        # Test conditions 3-4:
        ###########################################################################################
        # uncomment a single status code and the bottom code block in this
        # method to test various supported error responses from ICE.
        #
        # Expected results to verify (manually for now):
        #    A) Admin email sent (probably via an added log message...not working in DEV ATM)
        #    B) User error message mentions generic ICE-related problems
        #    C) 500 "internal server error" response (use Chrome's "network" develop tool)

        # Condition 3
        # message = 'Bad client request'
        # status = BAD_REQUEST

        # Condition 4
        # message = 'Internal Server Error'
        # status = INTERNAL_SERVER_ERROR

        ###########################################################################################
        # Test condition 5:
        ###########################################################################################
        # Uncomment a  status code and the bottom code block in this
        # method to test various supported error responses from ICE.
        #
        # Expected results to verify (manually for now):
        #    A) *NO* Admin email sent (probably via an added log message...not working in DEV ATM)
        #    B) User error message specifically mentions ICE permission problems
        #    C) 403 "forbidden" response (use Chrome's "network" develop tool)
        message = 'Forbidden'
        status = FORBIDDEN

        ###########################################################################################
        # Supporting error-generation code for test conditions 3-5 above
        ###########################################################################################
        from requests import HTTPError
        response = HTTPResponse(status=status)
        error = HTTPError(message, response=response)
        raise error
