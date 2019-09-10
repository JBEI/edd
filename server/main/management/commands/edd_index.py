"""
Populate the Solr indexes used by EDD.
"""

import time

from django.core.management.base import BaseCommand, CommandError

from main import solr

retry_limit = 10
retry_duration = 15


class Command(BaseCommand):
    help = "Ensures the Solr indexes are ready for EDD to use."

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.study_core = solr.StudyAdminSearch()
        self.user_core = solr.UserSearch()
        self.measurement_core = solr.MeasurementTypeSearch()

    def add_arguments(self, parser):
        # Add all parent arguments
        super().add_arguments(parser)
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            dest="force",
            help="Forces a re-index, even if documents already exist",
        )
        parser.add_argument(
            "--check",
            action="store_true",
            default=False,
            dest="check",
            help="Checks that server has a collection per search type; then exits",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            default=False,
            dest="clean",
            help="Ensures only one collection per search type; then exits",
        )

    def handle(self, *args, **options):
        self.verbosity = options["verbosity"]
        if options["check"]:
            self.do_check()
            return

        if options["clean"]:
            self.do_clean()
            return

        self.do_reindex(*args, **options)

    def do_check(self):
        # loop to check each searcher
        for searcher in (self.user_core, self.study_core, self.measurement_core):
            # track the tries for each searcher
            for _loop in range(retry_limit):
                try:
                    searcher.check()
                except solr.SolrException as e:
                    self.stderr.write(f"Check of {searcher} failed with {e}")
                    time.sleep(retry_duration)
                    continue
                # check has completed without error, break the retry loop
                self.output_normal(self.style.SUCCESS(f"Check {searcher} OK"))
                break
            else:
                raise CommandError(f"Exceeded limits on checking Solr {searcher}")

    def do_clean(self):
        for searcher in (self.user_core, self.study_core, self.measurement_core):
            removed = list(searcher.clean())
            if removed:
                self.output_normal(self.style.WARNING(f"Removed collections {removed}"))
            self.output_normal(self.style.SUCCESS(f"Clean {searcher} OK"))

    def do_reindex(self, *args, **options):
        for searcher in (self.user_core, self.study_core, self.measurement_core):
            self.output_normal(f"Checking index {searcher} ... ", ending="")
            if options["force"] or len(searcher) == 0:
                searcher.reindex()
                self.output_normal(self.style.SUCCESS("DONE"))
            else:
                self.output_normal(self.style.SUCCESS("OK"))

    def output_normal(self, message, **kwargs):
        if self.verbosity >= 1:
            self.stdout.write(message, **kwargs)
