import logging
from collections import Iterable, defaultdict

logger = logging.getLogger(__name__)


def flatten_json(source):
    """
    Takes a json-shaped input (usually a dict), and flattens any nested dict,
    list, or tuple with dotted key names.
    """
    # using a defaultdict because this used in rendering worklists
    # lookup of invalid key results in empty string instead of errors
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
                output[f"{key}.{sub}"] = item
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
