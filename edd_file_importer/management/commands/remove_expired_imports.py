"""
A simple manage.py command to remove database state and files associated with incomplete imports.
"""
import re

import arrow

from django.core.management import BaseCommand
from django.core.management.base import CommandError

from edd_file_importer.models import Import


class Command(BaseCommand):
    help = 'Removes database records and files associated with incomplete data imports'

    def add_arguments(self, parser):
        parser.add_argument('age', help='The age (in days) of incomplete imports to be removed',
                            type=int)

    def handle(self, *args, **options):
        age = options['age']

        try:
            self.stdout.write(f'Searching for imports older than {age} days...')

            expired = arrow.utcnow().shift(days=-age)
            imports = Import.objects.filter(status__in=(Import.Status.CREATED,
                                                        Import.Status.RESOLVED,
                                                        Import.Status.READY,
                                                        Import.Status.ABORTED,
                                                        Import.Status.FAILED),
                                            updated__mod_time__lt=expired.datetime)

            count = imports.count()
            self.stdout.write(f'Found {count} imports.')

            if not count:
                return

            result = input('Are you sure you want to delete them? (Y/n)')

            if not re.match(r'^\s*(?:Y|YES)\s*$', result, re.IGNORECASE):
                self.stdout.write('Aborting')
                return

            imports.delete()

        except Exception as e:
            raise CommandError(e)
