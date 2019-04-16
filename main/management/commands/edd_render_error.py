# coding: utf-8
"""
Command loads all the Django settings and pre-renders a 500 error page with
the site branding. This ensures an error page has all the same look and feel
as the rest of the site, even when there are errors that would otherwise
prevent rendering (e.g. loss of database connection, leading to inability to
load custom stylesheets and scripts set in site branding).
"""

import os.path

from django.core.management.base import BaseCommand
from django.template import loader
from io import BytesIO


class Command(BaseCommand):
    help = "Like collectstatic, except it will also watch for changes and re-collect."

    def add_arguments(self, parser):
        parser.add_argument(
            '-n', '--dry-run', action='store_true',
            help="Do everything except modify the filesystem.",
        )

    def get_output(self, error_template):
        # find the directory from where template is loaded
        template_dir = os.path.dirname(error_template.origin.name)
        if self.dry_run:
            # write out to a dummy buffer when doing dry-run
            return BytesIO()
        else:
            # otherwise write out to the real file
            return open(os.path.join(template_dir, "500.html"), mode="w")

    def handle(self, *args, **options):
        self.set_options(**options)
        self.render_error_page()

    def log(self, msg, level=2):
        """
        Small log helper
        """
        if self.verbosity >= level:
            self.stdout.write(msg)

    def render_error_page(self):
        # TODO: add some config options, rather than straight hard-coding this
        error_template = loader.get_template("5xx.html.tmpl")
        # TODO: write this to static files storage, and inform Nginx to use as error page
        with self.get_output(error_template) as out:
            out.write(error_template.render())
        self.log("Rendered static 500.html error page", level=2)

    def set_options(self, **options):
        """
        Set instance variables based on an options dict
        """
        self.verbosity = options['verbosity']
        self.dry_run = options['dry_run']
