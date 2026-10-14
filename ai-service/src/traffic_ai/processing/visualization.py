"""OpenCV rendering kept separate from inference and event rules."""

from __future__ import annotations

from typing import Any, Iterable

import cv2

from traffic_ai.schemas import BoundingBox, LineCrossingEvent, PlateDetection, Point, TrackedVehicle


def _integer_bbox(bbox: BoundingBox) -> tuple[int, int, int, int]:
    return int(bbox.x1), int(bbox.y1), int(bbox.x2), int(bbox.y2)


def annotate_frame(
    frame: Any,
    *,
    line_start: Point,
    line_end: Point,
    tracks: Iterable[TrackedVehicle],
    events: Iterable[LineCrossingEvent] = (),
    plates: Iterable[PlateDetection] = (),
) -> Any:
    rendered = frame.copy()
    event_track_ids = {event.track_id for event in events}
    cv2.line(
        rendered,
        (int(line_start.x), int(line_start.y)),
        (int(line_end.x), int(line_end.y)),
        (0, 0, 255),
        3,
    )
    for observation in tracks:
        x1, y1, x2, y2 = _integer_bbox(observation.detection.bbox)
        is_event = observation.track_id in event_track_ids
        color = (0, 0, 255) if is_event else (0, 200, 255)
        cv2.rectangle(rendered, (x1, y1), (x2, y2), color, 2)
        label = f"{observation.detection.class_name}"
        if observation.track_id is not None:
            label += f" #{observation.track_id}"
        cv2.putText(
            rendered,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )
    for plate in plates:
        x1, y1, x2, y2 = _integer_bbox(plate.bbox)
        cv2.rectangle(rendered, (x1, y1), (x2, y2), (255, 0, 0), 2)
    for event in events:
        cv2.putText(
            rendered,
            "LINE CROSSING CANDIDATE",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            2,
        )
    return rendered
