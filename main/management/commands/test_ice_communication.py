"""
A simple manage.py command to help in testing EDD/ICE communication and related configuration data.
"""
from django.conf import settings
from django.core.management import BaseCommand
from django.core.management.base import CommandError

from jbei.rest.auth import HmacAuth
from jbei.rest.clients.ice import IceApi


class Command(BaseCommand):
    help = 'Performs a simple test to confirm ICE-related configuration / communication'

    def add_arguments(self, parser):
        parser.add_argument('username', help='The username of the ICE user whose credentials '
                                             'will be used to access the system')
        parser.add_argument('--part_id', help='The optional part id, local primary key, '
                                              'or UUID for a single ICE part to be accessed. If '
                                              'not present, a generic search for parts will be '
                                              'performed instead.')
        parser.add_argument('--term', help='A search term to use in searching ICE. '
                                           'Ignored if --part_id is provided.', default='')
        parser.add_argument('--advanced', help='', action='store_true')

    def handle(self, *args, **options):
        # get the username argument
        username = options['username']

        # get ICE authentication configured via EDD's config files (secrets.env and / or
        # settings/local.py)
        auth = HmacAuth(key_id=settings.ICE_KEY_ID, username=username)
        ice = IceApi(auth, verify_ssl_cert=settings.VERIFY_ICE_CERT)
        ice.timeout = settings.ICE_REQUEST_TIMEOUT

        try:
            self.stdout.write('Contacting ICE at %s' % ice.base_url)

            part_id = options.get('part_id')

            if part_id:
                self.stdout.write('Requesting part "%s"' % part_id)
                entry = ice.get_entry(part_id)
                if entry:
                    self.stdout.write('Found the part!')
                else:
                    self.stdout.write(f'Part "{part_id}" was not found in ICE')
            else:
                search_term = options.get('term', '')
                if options.get('advanced', False):
                    self.stdout.write(f'Searching ICE for term "{search_term}" (advanced search)')
                    results_page = ice.search_entries(search_term)
                    self.print_advanced_search(results_page, username)

                else:
                    self.stdout.write(f'Searching ICE for term "{search_term}" '
                                      f'(simple UI-facing search)')
                    entry_info = ice.search(search_term)
                    self.print_simple_search(entry_info)
        except Exception as e:
            raise CommandError(e)

    def print_simple_search(self, results):
        self.stdout.write('Search results (entryInfo only):')
        for item in results:
            self.stdout.write(f'\t{item}')

    def print_advanced_search(self, results_page, username):
        if results_page:
            total_results = results_page.total_result_count
            page_results = results_page.current_result_count
            self.stdout.write('Successfully searched ICE for entries.')
            self.stdout.write(
                f'ICE reports {total_results} total entries and returned the first page of '
                f'{page_results}'
            )
        else:
            self.stdout.write(
                f'No entries found in ICE. If user {username} has any ICE entries '
                f'visible to him/her, you might want to look into this.'
            )
