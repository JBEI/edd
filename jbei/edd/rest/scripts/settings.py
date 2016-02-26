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
####################################################################################################

SIMULATE_STRAIN_CREATION = False
PRINT_FOUND_ICE_PARTS = True
PRINT_FOUND_EDD_STRAINS = True

####################################################################################################
#  local_settings.py: enables any configuration here to be overridden without changing this file.
####################################################################################################
try:
    from .local_settings import *  # noqa
except ImportError:
    pass