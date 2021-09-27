from django.contrib import admin
from django.contrib.sites.shortcuts import get_current_site
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction

from .models import DescribeExampleSet


class DescribeAdmin(admin.ModelAdmin):
    actions = ["use_examples"]
    list_display = (
        "name",
        "site",
        "example_image_file",
        "example_file",
    )
    fieldsets = (
        (None, {"fields": ("name", "site", "example_image_file", "example_file",)},),
    )
    # inlines = [JoinedInLine]

    @transaction.atomic()
    def use_examples(self, request, queryset):
        # get selected example set
        selected = queryset[0]
        # get current site
        current_site = get_current_site(request)

        # remove existing example set (if any)
        try:
            existing_examples = DescribeExampleSet.objects.get(site=current_site)
            if existing_examples.pk == selected.pk:
                # nothing to do!  already set
                self.message_user(request, f"{current_site.name} updated examples")
                return
            # de-select existing example set
            existing_examples.site = None
            existing_examples.save()
        except ObjectDoesNotExist:
            # default -- no example set was selected
            pass

        # update site
        DescribeExampleSet.objects.update_or_create(
            pk=selected.pk, defaults={"site": current_site}
        )
        self.message_user(request, f"{current_site.name} updated examples")


admin.site.register(DescribeExampleSet, DescribeAdmin)
