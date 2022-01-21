from django import template
from django.contrib.sites.shortcuts import get_current_site
from django.templatetags.static import static

from edd.describe.models import DescribeExampleSet

register = template.Library()


@register.simple_tag(takes_context=True)
def describe_preview_img(context):
    try:
        request = context.get("request", None)
        site = get_current_site(request)
        preview_url = DescribeExampleSet.objects.get(site=site).example_image_file.url
    except Exception:
        # if there is no configuration, show default image
        preview_url = static("edd/describe/example-image.png")
    return preview_url


@register.simple_tag(takes_context=True)
def describe_example_file(context):
    try:
        request = context.get("request", None)
        site = get_current_site(request)
        example_url = DescribeExampleSet.objects.get(site=site).example_file.url
    except Exception:
        # if there is no configuration, download default example file
        example_url = static("edd/describe/example_experiment_description.xlsx")
    return example_url
