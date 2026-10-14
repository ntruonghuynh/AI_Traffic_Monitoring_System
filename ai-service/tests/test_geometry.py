import pytest

from traffic_ai.schemas import BoundingBox, Point
from traffic_ai.utils.geometry import (
    bbox_bottom_center,
    segment_intersection,
    side_of_line,
    signed_distance_to_line,
)


def test_bbox_bottom_center() -> None:
    assert bbox_bottom_center(BoundingBox(10, 20, 30, 50)) == Point(20, 50)


def test_side_of_horizontal_line_and_tolerance() -> None:
    start, end = Point(0, 50), Point(100, 50)
    assert side_of_line(Point(20, 70), start, end) == 1
    assert side_of_line(Point(20, 30), start, end) == -1
    assert side_of_line(Point(20, 54), start, end, tolerance=5) == 0
    assert signed_distance_to_line(Point(20, 70), start, end) == pytest.approx(20)


def test_segment_intersection_respects_finite_line() -> None:
    assert segment_intersection(Point(50, 70), Point(50, 30), Point(0, 50), Point(100, 50)) == Point(50, 50)
    assert segment_intersection(Point(150, 70), Point(150, 30), Point(0, 50), Point(100, 50)) is None


def test_degenerate_line_is_rejected() -> None:
    with pytest.raises(ValueError):
        side_of_line(Point(1, 1), Point(0, 0), Point(0, 0))
