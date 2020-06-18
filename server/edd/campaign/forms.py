import logging

from django import forms
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from main import models as edd_models

from . import models

logger = logging.getLogger(__name__)


class CreateCampaignForm(forms.ModelForm):
    """Form to create a new Campaign."""

    class Meta:
        model = models.Campaign
        fields = ("name", "description")
        help_texts = {"name": _(""), "description": _("")}
        labels = {"name": _("Campaign Name")}

    def save(self, commit=True, *args, **kwargs):
        with transaction.atomic():
            # save the campaign
            c = super().save(commit=commit, *args, **kwargs)
            # default list of link permissions: study add/remove
            link_permissions = [
                models.CampaignPermission.convert_link_type(
                    edd_models.Study, models.CampaignPermission.ADD
                ),
                models.CampaignPermission.convert_link_type(
                    edd_models.Study, models.CampaignPermission.REMOVE
                ),
            ]
            # create campaign permission for creating user
            c.userpermission_set.create(
                campaign_permission=models.CampaignPermission.WRITE,
                link_permissions=link_permissions,
                study_permission=models.CampaignPermission.READ,
                user=c.created.mod_by,
            )
        return c
