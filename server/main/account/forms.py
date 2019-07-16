import logging

from allauth.account import adapter, forms, utils

logger = logging.getLogger(__name__)


class ResetPasswordForm(forms.ResetPasswordForm):
    def clean_email(self):
        # base class will raise a user-visible error if no matching email found
        # we should not be confirming/denying any email exists via web
        email = self.cleaned_data["email"]
        email = adapter.get_adapter().clean_email(email)
        # here is where base class would raise an error if no matches found
        return email

    def save(self, request, **kwargs):
        email = self.cleaned_data["email"]
        account_adapter = adapter.get_adapter(request)
        if callable(account_adapter.password_reset_request):
            self.users = account_adapter.password_reset_request(request, email)
        else:
            # if adapter does not have password_reset_request, fall back to base behavior
            self.users = utils.filter_users_by_email(email)
        # base class .save() call generates reset token and sends email to self.users
        return super().save(request, **kwargs)
