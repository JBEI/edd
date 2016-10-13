"""
A simple manage.py command to act as a convenience for account creation during initial EDD
installation. For more configurable/advanced use, use code here as a basis for working on the Django
command line (i.e. 'docker-compose exec appserver python manage.py shell')
"""
from getpass import getpass

from django.core.management import BaseCommand
from django.core.management.base import CommandError

from allauth.account.models import EmailAddress
from main.models import User

# TODO: revisit and try to extend django.contrib.auth.management.commands.createsuperuser. Potential
# to make this more flexible / maintainable based on that approach.
class Command(BaseCommand):
    help = 'Creates a user account from the command line in support of initial EDD installation.'
    _USERNAME_ARG = 'username'
    _EMAIL_ARG = 'email'
    _PASSWORD_ARG = 'password'
    _ADMIN_ARG = 'admin'

    def add_arguments(self, parser):
        parser.add_argument('-%s' % self._USERNAME_ARG, '-u')
        parser.add_argument('-%s' % self._EMAIL_ARG, '-e')
        parser.add_argument('-%s' % self._PASSWORD_ARG, '-p')
        parser.add_argument('-%s' % self._ADMIN_ARG, '-a', action='store_true', default=None)

    def handle(self, *args, **options):
        # as a convenience, prompt for any string parameters that weren't provided on the command
        # line
        username = self.get_required_string('Username', options, self._USERNAME_ARG)
        email = self.get_required_string('Email address', options, self._EMAIL_ARG)
        password = self.get_required_string('Password', options, self._PASSWORD_ARG, password=True)

        # if not provided on the command line, prompt for whether or not this should be an admin
        # account
        admin = options.get(self._ADMIN_ARG, None)
        while admin is None:
            value = raw_input('Should user "%s" be a sysadmin? (Y/n): ' % username).strip().upper()
            if ('Y' == value) or ('YES' == value):
                admin = True
            elif ('N' == value) or ('NO' == value):
                admin = False

        try:
            user_type = 'admin user' if admin else 'user'
            print('Creating %(user_type)s "%(username)s"...' % {'user_type': user_type,
                                                                'username': username})
            user = User.objects.create_user(username, email, password, is_superuser=admin,
                                            is_staff=admin)

            print('Simulating email address verification for user "%s"' % username)
            email_address = EmailAddress(user=user, email=user.email, verified=True, primary=True)
            email_address.save()

        except Exception as e:
            raise CommandError(e)

    @staticmethod
    def get_required_string(arg_description, options, arg_name, password=False):
        value = options.get(arg_name, None)
        while not value:
            if password:
                value = getpass('%s: ' % arg_description).strip()
            else:
                value = raw_input('%s: ' % arg_description).strip()
        return value



