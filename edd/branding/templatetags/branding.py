# coding: utf-8

from django import template
from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site
from django.contrib.staticfiles.templatetags.staticfiles import static
from django.template import Node
from django.utils.html import format_html

register = template.Library()


class EnvironmentLabelNode(Node):
    def render(self, context):
        env = getattr(settings, 'EDD_DEPLOYMENT_ENVIRONMENT')
        if env[:11] == 'DEVELOPMENT':
            return format_html('<span class="dev">{}</span>', env)
        elif env[:4] == 'TEST':
            return format_html('<span class="test">{}</span>', env)
        elif env[:11] == 'INTEGRATION':
            return format_html('<span class="int">{}</span>', env)
        return format_html('')


@register.simple_tag(takes_context=True)
def logo(context):
    try:
        request = context['request']
        site = get_current_site(request)
        logo_url = site.page.branding.logo_file.url
    except Exception:
        # if there is no branding, show default letters
        logo_url = static("main/images/edd_letters.png")
    return logo_url


@register.simple_tag(takes_context=True)
def stylesheet(context):
    try:
        request = context['request']
        site = get_current_site(request)
        stylesheet_url = site.page.branding.style_sheet.url
    except Exception:
        # if there is no branding..do not show a logo
        stylesheet_url = ""
    return stylesheet_url


@register.simple_tag()
def edd_version_number():
    if hasattr(settings, 'EDD_VERSION_HASH') and settings.EDD_VERSION_HASH:
        return f'{settings.EDD_VERSION_NUMBER} ({settings.EDD_VERSION_HASH})'
    return settings.EDD_VERSION_NUMBER


@register.simple_tag()
def env_background_color():
    env = getattr(settings, 'EDD_DEPLOYMENT_ENVIRONMENT', '')
    if env[:11] == 'DEVELOPMENT':
        return '#f4fef4'
    elif env[:4] == 'TEST':
        return '#fff0f2'
    elif env[:11] == 'INTEGRATION':
        return '#fff6e5'
    return 'transparent'


@register.tag
def env_label(parser, token):
    return EnvironmentLabelNode()
