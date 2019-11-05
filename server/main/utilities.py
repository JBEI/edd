import logging
from collections import Iterable, defaultdict

from django.conf import settings
from threadlocals.middleware import ThreadLocalMiddleware

logger = logging.getLogger(__name__)


class EDDSettingsMiddleware:
    """
    Adds an `edd_deployment` attribute to requests passing through the middleware with a value
    of the current deployment environment.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.edd_deployment = settings.EDD_DEPLOYMENT_ENVIRONMENT
        return self.get_response(request)


class EDDThreadLocalMiddleware(ThreadLocalMiddleware):
    """
    Alternate version of threadlocals.middleware.ThreadLocalMiddleware that will work with
    Django 2.0+.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.process_request(request)
        return response or self.get_response(request)


def flatten_json(source):
    """
    Takes a json-shaped input (usually a dict), and flattens any nested dict,
    list, or tuple with dotted key names.
    """
    # TODO: test this!
    output = defaultdict(lambda: "")
    # convert lists/tuples to a dict
    if not isinstance(source, dict) and isinstance(source, Iterable):
        source = dict(enumerate(source))
    for key, value in source.items():
        key = str(key)
        if isinstance(value, str):
            output[key] = value
        elif isinstance(value, (dict, Iterable)):
            for sub, item in flatten_json(value).items():
                output[".".join((key, sub))] = item
        else:
            output[key] = value
    return output


def interpolate_at(measurement_data, x):
    """
    Given an X-value without a measurement, use linear interpolation to
    compute an approximate Y-value based on adjacent measurements (if any).
    """
    # Nat mentioned delayed loading of numpy due to weird startup interactions
    import numpy

    data = [md for md in measurement_data if len(md.x) and md.x[0] is not None]
    data.sort(key=lambda a: a.x[0])
    if len(data) == 0:
        raise ValueError(
            "Can't interpolate because no valid measurement data are present."
        )
    xp = numpy.array([float(d.x[0]) for d in data])
    if not (xp[0] <= x <= xp[-1]):
        return None
    fp = numpy.array([float(d.y[0]) for d in data])
    return numpy.interp(float(x), xp, fp)
