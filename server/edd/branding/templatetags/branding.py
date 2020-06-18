from django import template
from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site
from django.template import Node
from django.templatetags.static import static
from django.utils.html import format_html, format_html_join
from django.utils.translation import gettext as _

register = template.Library()


class EnvironmentLabelNode(Node):
    def render(self, context):
        env = getattr(settings, "EDD_DEPLOYMENT_ENVIRONMENT", "")
        if env[:11] == "DEVELOPMENT":
            return format_html('<span class="dev">{}</span>', env)
        elif env[:4] == "TEST":
            return format_html('<span class="test">{}</span>', env)
        elif env[:11] == "INTEGRATION":
            return format_html('<span class="int">{}</span>', env)
        return format_html("")


class ExternalScriptsNode(Node):
    def render(self, context):
        # expects an iterator of iterables; generator wraps script strings in a 1-tuple
        return format_html_join(
            "\n",
            '<script type="text/javascript" src="{}"></script>',
            ((url,) for url in getattr(settings, "EDD_EXTERNAL_SCRIPTS", [])),
        )


@register.simple_tag(takes_context=True)
def logo(context):
    try:
        request = context.get("request", None)
        site = get_current_site(request)
        logo_url = site.page.branding.logo_file.url
    except Exception:
        # if there is no branding, show default image
        logo_url = static("main/images/edd_letters.png")
    return logo_url


@register.simple_tag(takes_context=True)
def logo_title(context):
    try:
        request = context.get("request", None)
        site = get_current_site(request)
        title = site.page.branding.logo_name
    except Exception:
        # if there is no branding, show default title
        title = _("EDD")
    return title


@register.simple_tag(takes_context=True)
def stylesheet(context):
    try:
        request = context.get("request", None)
        site = get_current_site(request)
        stylesheet_url = site.page.branding.style_sheet.url
    except Exception:
        # if there is no branding..do not show a logo
        stylesheet_url = ""
    return stylesheet_url


@register.simple_tag()
def edd_version_number():
    if hasattr(settings, "EDD_VERSION_HASH") and settings.EDD_VERSION_HASH:
        return f"{settings.EDD_VERSION_NUMBER} ({settings.EDD_VERSION_HASH})"
    return settings.EDD_VERSION_NUMBER


@register.simple_tag()
def env_background_color():
    env = getattr(settings, "EDD_DEPLOYMENT_ENVIRONMENT", "")
    if env[:11] == "DEVELOPMENT":
        # a light green-ish color
        return "#f4fef4"
    elif env[:4] == "TEST":
        # a light red-ish color
        return "#fff0f2"
    elif env[:11] == "INTEGRATION":
        # a light yellow-ish color
        return "#fff6e5"
    return "white"


@register.tag
def env_label(parser, token):
    return EnvironmentLabelNode()


@register.tag
def external_scripts(parser, token):
    return ExternalScriptsNode()


@register.simple_tag(takes_context=True)
def login_welcome(context):
    try:
        request = context["request"]
        site = get_current_site(request)
        return site.page.branding.login_welcome
    except Exception:
        # with no branding, show no welcome message
        return ""
