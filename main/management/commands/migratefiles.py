
"""
Write out actual files populating the 'attachments' table in the old EDD
schema.  This should be done after running convert.sql to populate the new
database (which only stores the filenames and metadata, not the contents).
"""

import errno
import os

from django.core.management.base import BaseCommand
from edd.local_settings import MEDIA_ROOT
from main.models import Attachment
from optparse import make_option

class Command (BaseCommand) :
    option_list = BaseCommand.option_list + (
        make_option(
            '--force',
            action='store_true',
            dest='force',
            default=False,
            help='Regenerate existing files if present'),
        )

    def handle (self, *args, **options):
        try:
            os.makedirs(MEDIA_ROOT)
        except OSError as exc:
            if exc.errno == errno.EEXIST and os.path.isdir(MEDIA_ROOT):
                pass
            else:
                raise
        print "Migrating attachments from old_edd schema..."
        attachments = Attachment.objects.all()
        for a in attachments:
            file_path = a.file.path
            if (not os.path.exists(file_path)) or options['force']:
                raw = list(Attachment.objects.raw(
                    "SELECT * FROM old_edd.attachments WHERE filename = %s", [a.filename]))
                if len(raw) == 0:
                    print("Could not find record for %s" % a.filename)
                else:
                    if len(raw) > 1:
                        print("Found %s records for %s, using first" % (len(raw), a.filename, ))
                    print "Writing to %s" % file_path
                    with open(file_path, "wb") as f:
                        f.write(raw[0].file_data)
