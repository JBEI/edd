from django.contrib.sites.models import clear_site_cache
from django.db import models
from django.db.models.signals import pre_delete, pre_save
from django.utils.translation import gettext_lazy as _

from edd.fields import FileField


class DescribeExampleSet(models.Model):
    """Describe example files and displays associated with an EDD instance"""

    name = models.TextField(
        blank=False,
        default="Default",
        help_text=_("Name for this example set"),
        null=False,
    )

    site = models.OneToOneField(
        "sites.Site", blank=True, unique=True, null=True, on_delete=models.CASCADE
    )

    example_image_file = models.ImageField(
        help_text=_(
            "Image displayed on the study page as an example of file metadata content"
        ),
        null=True,
    )
    example_file = FileField(
        help_text=_("Example description file available for download via study pages"),
        null=True,
    )

    class Meta:
        unique_together = ("name", "site")

    def __str__(self):
        return self.name


# without clearing cache on save, UI will read a stale DecribeExampleSet object
pre_save.connect(clear_site_cache, sender=DescribeExampleSet)
pre_delete.connect(clear_site_cache, sender=DescribeExampleSet)
