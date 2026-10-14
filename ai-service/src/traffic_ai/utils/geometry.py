"""Pure geometry helpers used by line-crossing rules."""

from __future__ import annotations

import math

from traffic_ai.schemas import BoundingBox, Point


def bbox_bottom_center(bbox: BoundingBox) -> Point:
    return Point(x=(bbox.x1 + bbox.x2) / 2.0, y=bbox.y2)


def signed_distance_to_line(point: Point, start: Point, end: Point) -> float:
    dx = end.x - start.x
    dy = end.y - start.y
    length = math.hypot(dx, dy)
    if length == 0:
        raise ValueError("Line start and end must be different")
    return (dx * (point.y - start.y) - dy * (point.x - start.x)) / length


def side_of_line(point: Point, start: Point, end: Point, tolerance: float = 0.0) -> int:
    distance = signed_distance_to_line(point, start, end)
    if abs(distance) <= tolerance:
        return 0
    return 1 if distance > 0 else -1


def segment_intersection(
    first_start: Point,
    first_end: Point,
    second_start: Point,
    second_end: Point,
    *,
    epsilon: float = 1e-9,
) -> Point | None:
    """Return the intersection of two finite segments, or ``None``."""

    r_x = first_end.x - first_start.x
    r_y = first_end.y - first_start.y
    s_x = second_end.x - second_start.x
    s_y = second_end.y - second_start.y
    denominator = r_x * s_y - r_y * s_x
    if abs(denominator) <= epsilon:
        return None

    q_minus_p_x = second_start.x - first_start.x
    q_minus_p_y = second_start.y - first_start.y
    t = (q_minus_p_x * s_y - q_minus_p_y * s_x) / denominator
    u = (q_minus_p_x * r_y - q_minus_p_y * r_x) / denominator
    if -epsilon <= t <= 1.0 + epsilon and -epsilon <= u <= 1.0 + epsilon:
        return Point(x=first_start.x + t * r_x, y=first_start.y + t * r_y)
    return None
