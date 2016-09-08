"""
Defines settings used by create_lines.py
"""

####################################################################################################
# Application URL's.
# Defaults target test servers to prevent accidental corruption / creation of
# real data. Override these by re-defining these values in a local_settings.py
####################################################################################################
EDD_URL = 'https://edd-test2.jbei.org/'
ICE_URL = 'https://registry-test.jbei.org'

EDD_PRODUCTION_HOSTNAMES = [
    'edd.jbei.org',
    'public-edd.jbei.org',
]

ICE_PRODUCTION_HOSTNAMES = [
    'registry.jbei.org',
    'public-registry.jbei.org',
    'registry.synberc.org',
    'acs-registry.jbei.org',
    'registry.jgi.doe.gov',
]

# SSL certificate verification. Override only to avoid configuration headaches in *LOCAL* testing.
VERIFY_EDD_CERT = True
VERIFY_ICE_CERT = True

# communication timeouts in seconds = (connection, response)
ICE_REQUEST_TIMEOUT = (10, 10)
EDD_REQUEST_TIMEOUT = (10, 10)

DEFAULT_LOCALE = b'C.UTF-8'  # works in Docker Debian container. Use b'en_US.UTF-8' for OSX.
####################################################################################################

SIMULATE_STRAIN_CREATION = False  # test flag that skips the strain creation step
PRINT_FOUND_ICE_PARTS = True
PRINT_FOUND_EDD_STRAINS = True

####################################################################################################
#  local_settings.py: enables any configuration here to be overridden without changing this file.
####################################################################################################
try:
    from .local_settings import *  # noqa
except ImportError:
    pass