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
    _USERNAME_ARG = 'username'

    def add_arguments(self, parser):
        parser.add_argument('username', help='The username of the ICE user whose credentials '
                                             'will be used to access the system')
        parser.add_argument('--part_id', help='The optional part id, local primary key, '
                                              'or UUID for a single ICE part to be accessed. If '
                                              'not present, a generic search for parts will be '
                                              'performed instead.')

    def handle(self, *args, **options):
        # get the username argument
        username = options['username']

        # get ICE authentication configured via EDD's config files (secrets.env and / or
        # settings/local.py)
        auth = HmacAuth(key_id=settings.ICE_KEY_ID, username=username)
        ice = IceApi(auth, verify_ssl_cert=settings.VERIFY_ICE_CERT)
        ice.timeout = settings.ICE_REQUEST_TIMEOUT

        try:
            print('Contacting ICE at %s' % ice.base_url)

            part_id = options.get('part_id')

            if part_id:
                print('Requesting part "%s"' % part_id)
                entry = ice.get_entry(part_id)
                if entry:
                    print('Found the part!')
                else:
                    print('Part "%s" was not found in ICE' % part_id)
            else:

                entries_results_page = ice.search_entries()
                if entries_results_page:
                    self.stdout.write(
                        'Successfully searched ICE for entries.\nICE reports %(total_entries)d '
                        'total entries and returned the first page of  %(returned_entries)d' % {
                            'total_entries': entries_results_page.total_result_count,
                            'returned_entries': entries_results_page.current_result_count,
                        }
                    )
                else:
                    print("No known error occurred, but also didn't find any entries in ICE. If "
                          "user %s has any ICE entries visible to him/her, you might want to "
                          "look into this." % username)
        except Exception as e:
            raise CommandError(e)
