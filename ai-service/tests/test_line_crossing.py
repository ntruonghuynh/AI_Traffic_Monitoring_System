from traffic_ai.schemas import BoundingBox, Point, TrackedVehicle, VehicleDetection
from traffic_ai.violation.line_crossing import LineCrossingDetector


def vehicle(track_id: int, bottom_y: float, *, x_center: float = 50) -> TrackedVehicle:
    return TrackedVehicle(
        track_id=track_id,
        detection=VehicleDetection(
            bbox=BoundingBox(x_center - 10, bottom_y - 20, x_center + 10, bottom_y),
            confidence=0.9,
            class_id=2,
            class_name="car",
        ),
    )


def detector(**overrides) -> LineCrossingDetector:
    options = {
        "direction": "positive_to_negative",
        "tolerance_pixels": 5,
        "max_missing_frames": 5,
        "allow_multiple_crossings": False,
    }
    options.update(overrides)
    return LineCrossingDetector(Point(0, 50), Point(100, 50), **options)


def update(rule: LineCrossingDetector, observation: TrackedVehicle | None, frame: int):
    return rule.update(
        [] if observation is None else [observation],
        frame_index=frame,
        timestamp_seconds=frame / 30,
    )


def test_detects_temporal_directional_crossing() -> None:
    rule = detector()
    assert update(rule, vehicle(7, 70), 0) == []
    events = update(rule, vehicle(7, 40), 1)
    assert len(events) == 1
    assert events[0].direction == "positive_to_negative"
    assert events[0].track_id == 7


def test_touching_line_and_jitter_do_not_repeat_event() -> None:
    rule = detector()
    assert update(rule, vehicle(2, 70), 0) == []
    assert update(rule, vehicle(2, 54), 1) == []
    assert update(rule, vehicle(2, 48), 2) == []
    events = update(rule, vehicle(2, 40), 3)
    assert len(events) == 1
    assert update(rule, vehicle(2, 70), 4) == []
    assert update(rule, vehicle(2, 40), 5) == []


def test_wrong_direction_is_ignored() -> None:
    rule = detector(direction="positive_to_negative")
    update(rule, vehicle(9, 30), 0)
    assert update(rule, vehicle(9, 70), 1) == []


def test_crossing_outside_finite_segment_is_ignored() -> None:
    rule = detector()
    update(rule, vehicle(10, 70, x_center=150), 0)
    assert update(rule, vehicle(10, 30, x_center=150), 1) == []


def test_expired_track_needs_a_new_baseline_observation() -> None:
    rule = detector(max_missing_frames=2)
    update(rule, vehicle(3, 70), 0)
    update(rule, None, 3)
    assert update(rule, vehicle(3, 30), 4) == []
