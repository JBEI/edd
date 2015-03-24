
"""
Write out actual files populating the 'attachments' table in the old EDD
schema.  This should be done after running convert.sql to populate the new
database (which only stores the filenames and metadata, not the contents).
"""

from main.models import Attachment
from django.core.management.base import BaseCommand
from optparse import make_option
import os.path

class Command (BaseCommand) :
  option_list = BaseCommand.option_list + (
    make_option('--force',
      action='store_true',
      dest='force',
      default=False,
      help='Regenerate existing files if present'),
    )
  def handle (self, *args, **options) :
    print "Migrating attachments from old_edd schema..."
    attachments = Attachment.objects.all()
    for a in attachments :
        file_path = a.file.path
        if (not os.path.exists(file_path)) or options['force'] :
            raw = Attachment.objects.raw("SELECT * FROM old_edd.attachments WHERE filename = '%s'" % a.filename)
            print "Writing to %s" % file_path
            f = open(file_path, "wb")
            f.write(raw[0].file_data)
            f.close()
