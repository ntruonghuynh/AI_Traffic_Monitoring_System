from traffic_ai.schemas import BoundingBox, TrackedVehicle, VehicleDetection
from traffic_ai.tracking.vehicle_tracker import VehicleTracker


def observation(track_id: int | None) -> TrackedVehicle:
    return TrackedVehicle(
        track_id=track_id,
        detection=VehicleDetection(BoundingBox(0, 0, 10, 10), 0.8, 2, "car"),
    )


class FakeDetector:
    def __init__(self, frames):
        self.frames = iter(frames)
        self.reset_count = 0

    def track(self, frame, *, tracker_config, persist):
        assert tracker_config == "bytetrack.yaml"
        assert persist is True
        return next(self.frames)

    def reset_tracking_state(self):
        self.reset_count += 1


def test_tracker_preserves_ids_and_filters_missing_ids() -> None:
    fake = FakeDetector([[observation(5), observation(None)], [], [observation(5)], []])
    tracker = VehicleTracker(fake, max_missing_frames=2)  # type: ignore[arg-type]
    tracker.reset()
    assert fake.reset_count == 1
    assert [item.track_id for item in tracker.update(object(), 0)] == [5]
    assert tracker.update(object(), 1) == []
    assert tracker.active_track_ids == {5}
    assert [item.track_id for item in tracker.update(object(), 2)] == [5]
    tracker.update(object(), 5)
    assert tracker.active_track_ids == frozenset()
