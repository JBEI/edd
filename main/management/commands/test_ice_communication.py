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
        parser.add_argument('username', help='Username of the ICE user REST queries will be '
                                             'attributed to. At JBEI, this is often the LBL email'
                                             'of the user, e.g. mark.forrer@lbl.gov.')
        parser.add_argument('--part', help='The identifier of a part to get from the local ICE '
                                           'registry. This can be either the integer local '
                                           'primary key, a UUID of a locally-stored part, '
                                           'or a part ID of a locally-stored part.')

    def handle(self, *args, **options):
        # get the username argument
        username = options['username']
        local_part_id = options.get('part', None)

        # get ICE authentication configured via EDD's config files (secrets.env and / or
        # settings/local.py)
        auth = HmacAuth(key_id=settings.ICE_KEY_ID, username=username)
        ice = IceApi(auth, verify_ssl_cert=settings.VERIFY_ICE_CERT)

        try:
            print('Contacting ICE at %s' % ice.base_url)

            if local_part_id:
                part = ice.get_entry(local_part_id)
                if part:
                    self.stdout.write('Successfully found part %s in ICE.' %
                                      local_part_id)
                    self.stdout.write(str(part))
            else:
                entries_results_page = ice.search_entries()
                if entries_results_page:
                    self.stdout.write(
                        'Successfully searched ICE for entries.\nICE reports %(total_entries)d total '
                        'entries and returned the first page of  %(returned_entries)d' % {
                            'total_entries': entries_results_page.total_result_count,
                            'returned_entries': entries_results_page.current_result_count,
                        }
                    )
                else:
                    print("No known error occurred, but also didn't find any entries in ICE. If user "
                          "%s has any ICE entries visible to him/her, you might want to look into "
                          "this." % username)
        except Exception as e:
            raise CommandError(e)
