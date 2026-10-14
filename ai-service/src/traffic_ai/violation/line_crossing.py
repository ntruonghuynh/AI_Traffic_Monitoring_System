"""Temporal line-crossing detection with hysteresis and deduplication."""

from __future__ import annotations

from dataclasses import dataclass

from traffic_ai.schemas import CrossingTransition, Point, TrackedVehicle
from traffic_ai.utils.geometry import bbox_bottom_center, segment_intersection, side_of_line


@dataclass(slots=True)
class _TrackLineState:
    stable_side: int
    stable_point: Point
    last_seen_frame: int


class LineCrossingDetector:
    """Create one candidate event when a tracked reference point changes line side."""

    VALID_DIRECTIONS = {"both", "positive_to_negative", "negative_to_positive"}

    def __init__(
        self,
        line_start: Point,
        line_end: Point,
        *,
        direction: str = "both",
        tolerance_pixels: float = 8.0,
        max_missing_frames: int = 30,
        allow_multiple_crossings: bool = False,
    ) -> None:
        if direction not in self.VALID_DIRECTIONS:
            raise ValueError(f"Unsupported crossing direction: {direction}")
        if line_start == line_end:
            raise ValueError("Line start and end must be different")
        self.line_start = line_start
        self.line_end = line_end
        self.direction = direction
        self.tolerance_pixels = tolerance_pixels
        self.max_missing_frames = max_missing_frames
        self.allow_multiple_crossings = allow_multiple_crossings
        self._states: dict[int, _TrackLineState] = {}
        self._emitted_track_ids: set[int] = set()

    def reset(self) -> None:
        self._states.clear()
        self._emitted_track_ids.clear()

    def update(
        self,
        observations: list[TrackedVehicle],
        *,
        frame_index: int,
        timestamp_seconds: float,
    ) -> list[CrossingTransition]:
        self._expire_stale_states(frame_index)
        transitions: list[CrossingTransition] = []
        for observation in observations:
            track_id = observation.track_id
            if track_id is None:
                continue
            point = bbox_bottom_center(observation.detection.bbox)
            current_side = side_of_line(
                point,
                self.line_start,
                self.line_end,
                tolerance=self.tolerance_pixels,
            )
            state = self._states.get(track_id)

            if state is None:
                if current_side != 0:
                    self._states[track_id] = _TrackLineState(
                        stable_side=current_side,
                        stable_point=point,
                        last_seen_frame=frame_index,
                    )
                continue

            state.last_seen_frame = frame_index
            if current_side == 0:
                continue
            if current_side == state.stable_side:
                state.stable_point = point
                continue

            previous_side = state.stable_side
            previous_point = state.stable_point
            state.stable_side = current_side
            state.stable_point = point

            crossing_point = segment_intersection(
                previous_point,
                point,
                self.line_start,
                self.line_end,
            )
            if crossing_point is None:
                continue

            crossing_direction = self._direction_name(previous_side, current_side)
            if self.direction != "both" and crossing_direction != self.direction:
                continue
            if not self.allow_multiple_crossings and track_id in self._emitted_track_ids:
                continue

            self._emitted_track_ids.add(track_id)
            transitions.append(
                CrossingTransition(
                    track_id=track_id,
                    vehicle=observation.detection,
                    frame_index=frame_index,
                    timestamp_seconds=timestamp_seconds,
                    previous_point=previous_point,
                    current_point=point,
                    from_side=previous_side,
                    to_side=current_side,
                    direction=crossing_direction,
                )
            )
        return transitions

    @staticmethod
    def _direction_name(from_side: int, to_side: int) -> str:
        if from_side == 1 and to_side == -1:
            return "positive_to_negative"
        return "negative_to_positive"

    def _expire_stale_states(self, frame_index: int) -> None:
        stale_ids = [
            track_id
            for track_id, state in self._states.items()
            if frame_index - state.last_seen_frame > self.max_missing_frames
        ]
        for track_id in stale_ids:
            del self._states[track_id]
