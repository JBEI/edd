# coding: utf-8
"""
An override of the built-in collectstatic command, which adds a --watch parameter. It will re-run
the collectstatic command when changes are detected in the watch directories.
"""

import time

from django.contrib.staticfiles.finders import get_finders
from django.contrib.staticfiles.management.commands import collectstatic
from functools import partial
from itertools import chain
from watchdog.events import FileSystemEventHandler
from watchdog.observers.polling import PollingObserver as Observer


class Command(collectstatic.Command):
    help = "Like collectstatic, except it will also watch for changes and re-collect."

    def add_arguments(self, parser):
        # Add all parent arguments
        super().add_arguments(parser)
        # Add our flag for watching files
        parser.add_argument(
            "--watch",
            action="store_true",
            default=False,
            dest="watch",
            help="Sets the command to watch static folders for changes; implies --noinput",
        )

    def collect_watch_paths(self):
        storages_generator = (finder.storages.values() for finder in get_finders())
        return {storage.location for storage in chain.from_iterable(storages_generator)}

    def handle(self, *args, **options):
        if options["watch"]:
            self.start_watch_loop(*args, **options)
        else:
            # fall back to parent functionality
            super().handle(*args, **options)

    def watch_handle(self, *args, **options):
        super().handle(*args, **options)
        # need to reset these values for the next run!
        self.copied_files = []
        self.symlinked_files = []
        self.unmodified_files = []
        self.post_processed_files = []

    def set_options(self, **options):
        super().set_options(**options)
        if options["watch"]:
            self.interactive = False

    def start_watch_loop(self, *args, **options):
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


class ChangeDebounceHandler(FileSystemEventHandler):
    """
    Sets state on any received event; calls to process will execute a callback after a delay.
    """

    def __init__(self, callback, delay=5, *args, **kwargs):
        super().__init__(*args, **kwargs)
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
