"""OpenCV rendering kept separate from inference and event rules."""

from __future__ import annotations

from typing import Any, Iterable

import cv2

from traffic_ai.schemas import BoundingBox, LineCrossingEvent, PlateDetection, Point, TrackedVehicle


def _integer_bbox(bbox: BoundingBox) -> tuple[int, int, int, int]:
    return int(bbox.x1), int(bbox.y1), int(bbox.x2), int(bbox.y2)


def _draw_candidate_label(frame: Any, label: str, bbox: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = bbox
    height, width = frame.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    padding_x = 6
    padding_y = 4
    font_scale = 0.6
    text_size, baseline = cv2.getTextSize(label, font, font_scale, 2)
    available_text_width = max(1, width - padding_x * 2)
    if text_size[0] > available_text_width:
        font_scale *= available_text_width / text_size[0]
    thickness = max(1, round(2 * font_scale / 0.6))
    text_size, baseline = cv2.getTextSize(label, font, font_scale, thickness)
    tag_width = min(width, text_size[0] + padding_x * 2)
    tag_height = text_size[1] + baseline + padding_y * 2

    if y1 >= tag_height + 2:
        tag_x = min(max(0, x1), width - tag_width)
        tag_y = y1 - tag_height - 2
    else:
        right_x = x2 + 2
        left_x = x1 - tag_width - 2
        if right_x + tag_width <= width:
            tag_x = right_x
            tag_y = min(max(0, y1), height - tag_height)
        elif left_x >= 0:
            tag_x = left_x
            tag_y = min(max(0, y1), height - tag_height)
        elif y2 + tag_height + 2 <= height:
            tag_x = min(max(0, x1), width - tag_width)
            tag_y = y2 + 2
        else:
            tag_x = min(max(0, x1), width - tag_width)
            tag_y = min(max(0, y1), height - tag_height)

    tag_x2 = tag_x + tag_width - 1
    tag_y2 = tag_y + tag_height - 1
    cv2.rectangle(frame, (tag_x, tag_y), (tag_x2, tag_y2), (0, 0, 255), -1)
    text_x = min(tag_x + padding_x, width - text_size[0])
    text_y = min(tag_y + padding_y + text_size[1], height - baseline)
    cv2.putText(frame, label, (text_x, text_y), font, font_scale, (255, 255, 255), thickness)


def annotate_frame(
    frame: Any,
    *,
    line_start: Point,
    line_end: Point,
    tracks: Iterable[TrackedVehicle],
    events: Iterable[LineCrossingEvent] = (),
    plates: Iterable[PlateDetection] = (),
    highlight_track_id: int | None = None,
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
        if highlight_track_id is not None:
            is_highlighted = observation.track_id == highlight_track_id
            color = (0, 0, 255) if is_highlighted else (192, 192, 192)
            thickness = 3 if is_highlighted else 1
            cv2.rectangle(rendered, (x1, y1), (x2, y2), color, thickness)
            if is_highlighted:
                label_type = observation.detection.class_name.encode("ascii", errors="ignore").decode("ascii")
                label_type = label_type or "vehicle"
                _draw_candidate_label(
                    rendered,
                    f"CANDIDATE {label_type} #{observation.track_id}",
                    (x1, y1, x2, y2),
                )
            continue
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
