"""Stateful ByteTrack integration through the vehicle detector adapter."""

from __future__ import annotations

import logging
from typing import Any

from traffic_ai.detection.vehicle_detector import VehicleDetector
from traffic_ai.schemas import TrackedVehicle


LOGGER = logging.getLogger(__name__)


class VehicleTracker:
    """Preserve Ultralytics ByteTrack state across sequential frames."""

    def __init__(
        self,
        detector: VehicleDetector,
        *,
        tracker_config: str = "bytetrack.yaml",
        persist: bool = True,
        require_track_id: bool = True,
        max_missing_frames: int = 30,
    ) -> None:
        self.detector = detector
        self.tracker_config = tracker_config
        self.persist = persist
        self.require_track_id = require_track_id
        self.max_missing_frames = max_missing_frames
        self._last_seen: dict[int, int] = {}

    def reset(self) -> None:
        self._last_seen.clear()
        self.detector.reset_tracking_state()

    def update(self, frame: Any, frame_index: int) -> list[TrackedVehicle]:
        observations = self.detector.track(
            frame,
            tracker_config=self.tracker_config,
            persist=self.persist,
        )
        accepted: list[TrackedVehicle] = []
        for observation in observations:
            if observation.track_id is None:
                if self.require_track_id:
                    LOGGER.debug("Skipping untracked detection at frame %d", frame_index)
                    continue
            else:
                self._last_seen[observation.track_id] = frame_index
            accepted.append(observation)

        expired = [
            track_id
            for track_id, last_seen in self._last_seen.items()
            if frame_index - last_seen > self.max_missing_frames
        ]
        for track_id in expired:
            del self._last_seen[track_id]
        return accepted

    @property
    def active_track_ids(self) -> frozenset[int]:
        return frozenset(self._last_seen)
