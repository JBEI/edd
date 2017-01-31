"""
A catch-all module for general utility code that doesn't clearly belong elsewhere.
"""
import arrow
import getpass
import logging
import re

from six.moves import input as raw_input
from sys import stdout


logger = logging.getLogger(__name__)

_WORD_OR_DIGIT_REGEX = r'(?:\w\d)'
ALPHANUM_REGEX = '[0-9a-fA-F]'

DOCKER_HOST_ENV_VARIABLE = 'DOCKER_HOST'

# WARNING: for best UUID results, prefer using UUID(string) in a try/catch over regex.
TYPICAL_UUID_REGEX = (
    r'%(alphanum)s8}\-%(alphanum)s{4}\-%(alphanum)s{4}\-%(alphanum)s{4}\-%(alphanum)s{12}' % {
        'alphanum': ALPHANUM_REGEX})

PK_OR_TYPICAL_UUID_REGEX = r'(?:\d+)|%(uuid_regex)s' % {
    'uuid_regex': TYPICAL_UUID_REGEX,
}

TYPICAL_UUID_PATTERN = re.compile(TYPICAL_UUID_REGEX, re.UNICODE)
PK_OR_TYPICAL_UUID_PATTERN = re.compile(PK_OR_TYPICAL_UUID_REGEX, re.UNICODE)

# WARNING: for best results, always refer to ICE parts by UUID when possible rather than by part
# number, which isn't guaranteed to be unique across deployments. Sometimes it will be
# necessary to use part numbers for simplicity in user input, or this pattern to test the
# format of user input (e.g. in URLs). This pattern was exhaustively
# tested against existing ICE entries in JBEI's private ICE instance on 3/31/16.
TYPICAL_JBEI_ICE_PART_NUMBER_REGEX = r'\s*([A-Z]+_[A-Z]?\d{4,6}[A-Z]?)\s*'
TYPICAL_JBEI_ICE_PART_NUMBER_PATTERN = re.compile(
    TYPICAL_JBEI_ICE_PART_NUMBER_REGEX, re.IGNORECASE
)


# colors to help user prompts stand out in the mess of (helpful, but overwhelming) output from this
# script. See http://stackoverflow.com/questions/287871/print-in-terminal-with-colors-using-python
class TerminalFormats:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


class UserInputTimer(object):
    """
    A simple wrapper over tha raw_input() builtin that handles tracking the amount of time spent
    waiting on user input. Also adds option functionality to color the terminal output to help it
    stand out from other information on the command line (may not work on every OS, or may need
    configuration on Windows. See
    http://stackoverflow.com/questions/287871/print-in-terminal-with-colors-using-python)
    """
    def __init__(self, default_format=None):
        """
        Creates a new UserInputTimer with the time spent waiting for user input initialized to
        zero.
        :param default_format: the default format for printing prompts to the terminal (see
            TerminalFormats)
        """
        now = arrow.utcnow()
        self._waiting_on_user_delta = now - now
        self.default_format = default_format

    def user_input(self, prompt=None):
        """
        A wrapper function for getting user input while keeping track of the amount of time spent
        waiting for it.
        """
        start = arrow.utcnow()
        try:
            if self.default_format and prompt:
                return raw_input('%(format)s%(prompt)s%(end)s' % {
                    'format': self.default_format,
                    'prompt': prompt,
                    'end': TerminalFormats.ENDC
                })
            else:
                return raw_input(prompt)
        finally:
            end = arrow.utcnow()
            self._waiting_on_user_delta += end - start

    @property
    def wait_time(self):
        return self._waiting_on_user_delta

_SECONDS_PER_HOUR = 3600
_HOURS_PER_DAY = 24
_SECONDS_PER_MINUTE = 60
_SECONDS_PER_MONTH = _SECONDS_PER_HOUR * _HOURS_PER_DAY * 30
# NOTE: this causes years to have 360 days, but it's consistent / good enough
_SECONDS_PER_YEAR = _SECONDS_PER_MONTH * 12
_SECONDS_PER_DAY = _SECONDS_PER_HOUR * _HOURS_PER_DAY


def to_human_relevant_delta(seconds):
    """
    Converts the input to a human-readable time duration, with only applicable units displayed,
    and with precision limited to a level where humans are likely to take interest based on the
    largest time increment present in the input. NOTE: if the arrow library (e.g. humanize(
    )) fulfills your needs, you should probably use that. It doesn't seem
    to support good phrasing for simple time quantities that aren't relative to a specific
    timestamp, or to give sufficiently granular output to help with software performance analysis.

    Daylight savings time, leap years, etc are not
    taken into account, months are assumed to have 30 days, and years have 12 months (=360 days).
    The minimum time increment displayed for any value is milliseconds. The output of this method
    is intended exclusively for human use, e.g. for displaying task execution time in the GUI
    and/or logs. If you care about precise formatting of the output, this probably isn't the method
    for you.

    Note that the result is designed to be most useful at lower time increments, and probably needs
    additional formatting (e.g. more liberal and/or configurable use of abbreviations and max.
    precision) for use at longer time intervals. As the output is intended for human use, no
    guarantee is made that the output will be constant over time, though changes can be
    reasonably expected to make the output more relevant and/or readable.



    NOTE: a Java port of this method also exists in edd-analytics-java. Consider maintaining that
    implementation and its unit tests along with this one.

    :param seconds: time in seconds
    :return:
    """
    # TODO: as a future improvement, consider adding an optional minimum precision parameter
    # to improve flexibility for more use cases

    def _pluralize(str, quantity):
        if quantity > 1:
            return str + 's'
        return str

    def _append(formatted_duration, part_str):
        if formatted_duration:
            return ' '.join([formatted_duration, part_str])
        else:
            return part_str

    formatted_duration = ''

    # compute years
    if seconds >= _SECONDS_PER_YEAR:
        years = seconds // _SECONDS_PER_YEAR
        seconds %= _SECONDS_PER_YEAR
        years_str = '%d year' % years
        formatted_duration = _append(formatted_duration, years_str)
        formatted_duration = _pluralize(formatted_duration, years)

    # compute months
    if seconds >= _SECONDS_PER_MONTH:
        months = seconds // _SECONDS_PER_MONTH
        seconds %= _SECONDS_PER_MONTH

        months_str = '%d month' % months
        formatted_duration = _append(formatted_duration, months_str)
        formatted_duration = _pluralize(formatted_duration, months)

    # compute days
    if seconds >= _SECONDS_PER_DAY:
        days = seconds // _SECONDS_PER_DAY
        seconds %= _SECONDS_PER_DAY
        days_str = '%d day' % days
        formatted_duration = _append(formatted_duration, days_str)
        formatted_duration = _pluralize(formatted_duration, days)

    # compute hours
    if seconds >= _SECONDS_PER_HOUR:
        hours = seconds // _SECONDS_PER_HOUR
        seconds %= _SECONDS_PER_HOUR
        hours_str = '%d hour' % hours
        formatted_duration = _append(formatted_duration, hours_str)
        formatted_duration = _pluralize(formatted_duration, hours)

    # store results so far so we can detect later whether the time has any increment greater
    # than minutes
    larger_than_minutes = formatted_duration
    minutes = 0

    # compute minutes
    if seconds >= _SECONDS_PER_MINUTE:
        minutes = seconds // _SECONDS_PER_MINUTE
        seconds %= _SECONDS_PER_MINUTE
        minutes_str = '%d minute' % minutes
        formatted_duration = _append(formatted_duration, minutes_str)
        formatted_duration = _pluralize(formatted_duration, minutes)

    # don't compute fractional seconds if humans are unlikely to care
    show_fractional_seconds = (not larger_than_minutes) and (minutes < 10)

    if (seconds > 0) or (not formatted_duration):
        # show ms if no greater time increment exists in the data
        if (seconds < 1) and not formatted_duration:
            formatted_duration = '%d ms' % round(seconds * 1000)
        # otherwise, append either fractional or rounded seconds
        elif show_fractional_seconds:
            decimal_sec_str = '%.2f s' % seconds
            formatted_duration = _append(formatted_duration, decimal_sec_str)
        else:
            int_sec_str = '%d s' % round(seconds)
            formatted_duration = _append(formatted_duration, int_sec_str)

    return formatted_duration


class LoginResult:
    def __init__(self, session_auth, username, password=None):
        self.session_auth = session_auth
        self.username = username
        self.password = password


def session_login(session_auth_class, base_url, application_name, username_arg=None,
                  password_arg=None, user_input=None, print_result=True, timeout=None,
                  verify_ssl_cert=True):
    """
    A helper method to simplify work in gathering user access credentials and attempting to log
    into a remote service from a terminal-based application. If user credentials are provided,
    they're used to attempt to log into the service. If not, or if the login attempt fails, the
    user will be prompted to re-enter credentials on the assumption that they weren't entered
    correctly the first time.
    :param session_auth_class: the class responsible to implement session authentication for the
    specified service
    :param username_arg: optional username, or None to prompt
    :param password_arg: optional password, or None to prompt
    :param user_input: optional object responsible to gather user input
    :param timeout:
    :param verify_ssl_cert:
    :return:
    :raises ConnectionError: if no connection could be made to the remote service
    """

    user_input = user_input if user_input else UserInputTimer()
    session_auth = None
    attempted_login = False
    username = None
    password = None

    while not session_auth:

        # gather user credentials from command line arguments and/or user prompt
        if (username_arg is not None) and (not attempted_login):
            username = username_arg
        else:
            if not attempted_login:
                username = getpass.getuser()
            username_input = user_input.user_input('Username [%s]: ' % username)
            username = username_input if username_input else username
        if (password_arg is not None) and not attempted_login:
            password = password_arg
        else:
            append_prompt = ' [enter to use existing entry]' if attempted_login else ''
            password_input = getpass.getpass('Password for %s%s: ' % (username, append_prompt))
            password = password_input if password_input else password
        attempted_login = True
        # attempt login
        if print_result:
            # Python 2/3 cross-compatible print *without* a line break
            stdout.write('Logging into %s at %s... ' % (application_name, base_url))
        session_auth = session_auth_class.login(base_url=base_url, username=username,
                                                password=password,
                                                verify_ssl_cert=verify_ssl_cert, timeout=timeout)
        if session_auth:
            if print_result:
                print('success!')
            return LoginResult(session_auth, username, password)
        elif print_result:
            print('failed :-{')
