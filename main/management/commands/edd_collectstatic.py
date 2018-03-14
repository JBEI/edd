# coding: utf-8
"""
An override of the built-in collectstatic command, which adds a --watch parameter. It will re-run
the collectstatic command when changes are detected in the watch directories.
"""

import time

from django.contrib.staticfiles.finders import get_finders
from django.contrib.staticfiles.management.commands import collectstatic
from functools import partial
from watchdog.events import FileSystemEventHandler
from watchdog.observers.polling import PollingObserver as Observer


class Command(collectstatic.Command):
    help = 'Like collectstatic, except it will also watch for changes and re-collect.'

    def __init__(self, *args, **kwargs):
        super(Command, self).__init__(*args, **kwargs)

    def add_arguments(self, parser):
        # Add all parent arguments
        super(Command, self).add_arguments(parser)
        # Add our flag for watching files
        parser.add_argument(
            '--watch',
            action='store_true',
            default=False,
            dest='watch',
            help='Sets the command to watch static folders for changes; implies --noinput',
        )

    def collect_watch_paths(self):
        paths = set()
        for finder in get_finders():
            for path, storage in finder.list(self.ignore_patterns):
                paths.add(storage.location)
        return paths

    def handle(self, *args, **options):
        if options['watch']:
            self.set_options(**options)
            callback = partial(self.watch_handle, *args, **options)
            handler = ChangeDebounceHandler(callback)
            observer = Observer()
            for path in self.collect_watch_paths():
                observer.schedule(handler, path, recursive=True)
            observer.start()
            try:
                while True:
                    handler.process()
                    time.sleep(1)
            except KeyboardInterrupt:
                observer.stop()
            observer.join()
        else:
            # fall back to parent functionality
            super(Command, self).handle(*args, **options)

    def watch_handle(self, *args, **options):
        super(Command, self).handle(*args, **options)
        # need to reset these values for the next run!
        self.copied_files = []
        self.symlinked_files = []
        self.unmodified_files = []
        self.post_processed_files = []

    def set_options(self, **options):
        super(Command, self).set_options(**options)
        if options['watch']:
            self.interactive = False


class ChangeDebounceHandler(FileSystemEventHandler):
    """
    Sets state on any received event; calls to process will execute a callback after a delay.
    """

    def __init__(self, callback, delay=5, *args, **kwargs):
        super(ChangeDebounceHandler, self).__init__(*args, **kwargs)
        self.callback = callback
        self.delay = delay
        self.reset()

    def on_any_event(self, event):
        # TODO: should ignore events that match ignore_patterns
        self.event_received = True
        self.last_event = int(time.time())

    def process(self):
        if self.event_received:
            time_since = int(time.time()) - self.last_event
            if time_since > self.delay:
                self.reset()
                self.callback()

    def reset(self):
        self.event_received = False
        self.last_event = -1
