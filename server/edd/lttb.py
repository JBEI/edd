import itertools
import math
import typing
from collections.abc import Iterable, Sequence

Point = tuple[typing.SupportsFloat, typing.SupportsFloat]
Data = Sequence[Point]


def _lttb_area(a: Point, b: Point, c: Point) -> float:
    # area of triangle
    a_x, b_x, c_x = float(a[0]), float(b[0]), float(c[0])
    a_y, b_y, c_y = float(a[1]), float(b[1]), float(c[1])
    # all triangles can be made of two triangles,
    # to left and right of selected point
    left = math.fabs((a_x - b_x) * (a_y - b_y))
    right = math.fabs((b_x - c_x) * (b_y - c_y))
    # triangle area is half the squares
    return 0.5 * (left + right)


def _lttb_average(bucket: Data) -> Point:
    # average point in bucket
    x, y = zip(*bucket)
    size = len(bucket)
    return math.fsum(x) / size, math.fsum(y) / size


def _lttb_choose(bucket: Data, sizes: Sequence[typing.SupportsFloat]) -> Point:
    selected_index = max(enumerate(sizes), key=lambda p: float(p[1]))[0]
    return bucket[selected_index]


def _lttb_distribute(points: Data, threshold: int) -> Iterable[Data]:
    # divide points into buckets; first in first, last in last, divide others
    inner_points = points[1:-1]
    total_size = len(inner_points)
    bucket_size = math.floor(total_size / (threshold - 2))
    remainder = total_size % (threshold - 2)
    it = iter(inner_points)
    # first remainder count of buckets get one additional item
    yield from itertools.islice(itertools.batched(it, bucket_size + 1), remainder)
    # rest of buckets get normal item count
    yield from itertools.batched(it, bucket_size)


def largest_triangle_three_buckets(points: Data, threshold: int) -> Iterable[Point]:
    """
    Implementation of Largest Triangle Three Buckets downsampling algorithm
    from Steinarsson 2013.
    """
    # select and yield the first point
    previous = points[0]
    yield previous
    # divide points into buckets; first in first, last in last, divide others
    buckets = _lttb_distribute(points, threshold)
    # loop over buckets pairwise
    for current_bucket, next_bucket in itertools.pairwise(buckets):
        next_average = _lttb_average(next_bucket)
        # calculate the triangle size for each point in current bucket
        # with the previous point and average of next bucket
        sizes = [_lttb_area(previous, point, next_average) for point in current_bucket]
        # choose largest triangle as next iteration previous point
        previous = _lttb_choose(current_bucket, sizes)
        yield previous
    # select from penultimate bucket
    last = points[-1]
    sizes = [_lttb_area(previous, point, last) for point in next_bucket]
    yield _lttb_choose(next_bucket, sizes)
    # yield final point
    yield last
