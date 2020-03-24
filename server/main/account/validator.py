import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class LBNLTemplate2Validator:
    """
    Implements LBNL Template 2 Password validation.

    See: https://commons.lbl.gov/display/cpp/Minimum+Security+Requirements
      - Minimum 8 characters
      - 1 lowercase letter
      - 1 uppercase letter
      - 1 number
      - 1 special character
    """

    lower = re.compile(r"[a-z]")
    upper = re.compile(r"[A-Z]")
    digit = re.compile(r"[0-9]")
    special = re.compile(r"[^a-zA-Z0-9]")

    def _checks_fail(self, password):
        yield len(password) < 8
        yield len(self.lower.findall(password)) < 1
        yield len(self.upper.findall(password)) < 1
        yield len(self.digit.findall(password)) < 1
        yield len(self.special.findall(password)) < 1

    def validate(self, password, user=None):
        if any(self._checks_fail(password)):
            raise ValidationError(
                _(
                    "Passwords must be at least 8 characters long, "
                    "with at least one each of: Uppercase, lowercase, "
                    "numeral, and special character."
                )
            )

    def get_help_text(self):
        return _(
            "LBNL requirements specify your password must be "
            "at least 8 characters, with at least one character in each of "
            "Uppercase, lowercase, numeral, and special character."
        )
