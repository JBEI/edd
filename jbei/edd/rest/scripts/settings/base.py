"""
Defines settings used by scripts in this package.  Clients may override settings defined here in a 
custom local.py in the same package.

Note that because of the development history of scripts within this package, settings defined here
may not be universally read/applied by all of the scripts.  When overriding a setting, it's best
to double-check the script of interest, which may need updates to use more recently-defined 
settings.
"""

from jbei.rest.clients.edd.api import DEFAULT_PAGE_SIZE as DEFAULT_EDD_PAGE_SIZE
from jbei.rest.clients.ice.api import DEFAULT_RESULT_LIMIT as DEFAULT_ICE_PAGE_SIZE

###################################################################################################
# Application URL's.
# Defaults target test servers to prevent accidental corruption / creation of
# real data. Override these by re-defining these values in a local_settings.py
###################################################################################################
EDD_URL = 'https://edd-test.jbei.org/'
ICE_URL = 'https://registry-test.jbei.org'

EDD_USERNAME = None
EDD_PASSWORD = None

# result page sizes used for REST API query results
EDD_PAGE_SIZE = DEFAULT_EDD_PAGE_SIZE
ICE_PAGE_SIZE = DEFAULT_ICE_PAGE_SIZE

# SSL certificate verification. Override only to avoid configuration headaches in *LOCAL* testing.
VERIFY_EDD_CERT = True
VERIFY_ICE_CERT = True

# communication timeouts in seconds = (connection, response)
ICE_REQUEST_TIMEOUT = (10, 10)
EDD_REQUEST_TIMEOUT = (10, 10)

DEFAULT_LOCALE = b'C.UTF-8'  # works in Docker Debian container. Use b'en_US.UTF-8' for OSX.

###################################################################################################
# Application-specific configuration for create_lines.py.
# TODO: relocate these to a separate file, or wait and delete when create_lines.py is
# fully replaced / eventually removed.
###################################################################################################
# Application/context-specific data used by create_lines.py
SIMULATE_STRAIN_CREATION = False  # test flag that skips the strain creation step
PRINT_FOUND_ICE_PARTS = True
PRINT_FOUND_EDD_STRAINS = True

###################################################################################################
# Application/context-specific data used by maintain_ice_links.py.
# # These help identify erroneous ICE experiment links created during EDD/ICE integration
# testing or during earlier phases code  maturity. TODO: relocate these to a separate file.
###################################################################################################
EDD_PRODUCTION_HOSTNAMES = [
    'edd.jbei.org',
    'public-edd.jbei.org',
    'edd.agilebiofoundry.org',
    'public-edd.agilebiofoundry.org',
]

ICE_PRODUCTION_HOSTNAMES = [
    'registry.jbei.org',
    'public-registry.jbei.org',
    'registry.synberc.org',
    'acs-registry.jbei.org',
    'registry.jgi.doe.gov',
    'registry.agilebiofoundry.org',
    'public-registry.agilebiofoundry.org',
]

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '%(asctime)s %(name)-12s %(levelname)-8s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
          '__main__': {
             'level': 'INFO',
             'handlers': ['console', ],
         },
    },
}