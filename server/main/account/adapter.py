import warnings

from edd.account import EDDAccountAdapter, EDDSocialAccountAdapter
from edd.auth_backend import AllauthLDAPBackend, LocalTestBackend

warnings.warn(
    "The main.account.adapter module is deprectated; its members have moved to "
    "edd.account and edd.auth_backend instead.",
    DeprecationWarning,
)

# Keeping the names around here for backward compatibility
__all__ = [
    "AllauthLDAPBackend",
    "EDDAccountAdapter",
    "EDDSocialAccountAdapter",
    "LocalTestBackend",
]
