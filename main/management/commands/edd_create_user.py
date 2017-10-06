"""
A simple manage.py command to act as a convenience for account creation during initial EDD
installation.
"""
from django.contrib.auth.management.commands import createsuperuser
from django.core.management.base import CommandError

from allauth.account.models import EmailAddress


ADMIN = 'admin'


class Command(createsuperuser.Command):
    help = 'Creates a user account with an auto-validated email address.'

    def __init__(self, *args, **kwargs):
        super(Command, self).__init__(*args, **kwargs)
        self._username = None

    def add_arguments(self, parser):
        # Add all parent arguments
        super(Command, self).add_arguments(parser)
        # Add our flag for normal/super users
        parser.add_argument(
            '--%s' % ADMIN,
            action='store_true',
            default=False,
            dest=ADMIN,
            help=('Specifies that the created user is a superuser. Default is to create a normal '
                  'user.'),
        )

    def handle(self, *args, **options):
        # attempt to load username from command-line options
        # username can come from command-line flag OR from interactive input
        self._username = options.get(self.UserModel.USERNAME_FIELD)
        # let the base class handle all the user-creation details
        super(Command, self).handle(*args, **options)
        # now try to create the validated EmailAddress object
        try:
            user = self.UserModel.objects.get(username=self._username)
            # overriding the value of is_superuser set by parent (always True in parent)
            user.is_superuser = options[ADMIN]
            # create a verified primary EmailAddress for the user
            email_address = EmailAddress(user=user, email=user.email, verified=True, primary=True)
            email_address.save()
            user.save()
            if options['verbosity'] >= 1:
                self.stdout.write(
                    'Simulated email address verification for user "%s"' % self._username
                )
        except Exception as e:
            raise CommandError(e)

    def get_input_data(self, field, message, default=None):
        """ Override delegates to parent method, only captures value of interactive input for the
            username field. """
        val = super(Command, self).get_input_data(field, message, default)
        if field.name == 'username':
            self._username = val
        return val
