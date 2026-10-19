"""Stable data contracts shared by the AI pipeline and future backend."""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.1"


class EventType(str, Enum):
    LINE_CROSSING_CANDIDATE = "LINE_CROSSING_CANDIDATE"


class EventStatus(str, Enum):
    PENDING_REVIEW = "PENDING_REVIEW"


class ProcessingStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


def _serialize(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, Path)):
        return value.isoformat() if isinstance(value, datetime) else value.as_posix()
    if is_dataclass(value):
        return {key: _serialize(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    return value


class JsonSerializable:
    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


@dataclass(frozen=True, slots=True)
class Point(JsonSerializable):
    x: float
    y: float

    def __post_init__(self) -> None:
        if not (math.isfinite(self.x) and math.isfinite(self.y)):
            raise ValueError("Point coordinates must be finite")


@dataclass(frozen=True, slots=True)
class BoundingBox(JsonSerializable):
    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        values = (self.x1, self.y1, self.x2, self.y2)
        if not all(math.isfinite(value) for value in values):
            raise ValueError("Bounding box coordinates must be finite")
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("Bounding box must have positive width and height")

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    def clipped(self, width: int, height: int) -> BoundingBox:
        x1 = min(max(self.x1, 0.0), float(width - 1))
        y1 = min(max(self.y1, 0.0), float(height - 1))
        x2 = min(max(self.x2, x1 + 1.0), float(width))
        y2 = min(max(self.y2, y1 + 1.0), float(height))
        return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)


@dataclass(frozen=True, slots=True)
class VehicleDetection(JsonSerializable):
    bbox: BoundingBox
    confidence: float
    class_id: int
    class_name: str


@dataclass(frozen=True, slots=True)
class TrackedVehicle(JsonSerializable):
    detection: VehicleDetection
    track_id: int | None


@dataclass(frozen=True, slots=True)
class PlateDetection(JsonSerializable):
    bbox: BoundingBox
    confidence: float
    class_id: int
    class_name: str


@dataclass(frozen=True, slots=True)
class OCRCandidate(JsonSerializable):
    raw_text: str
    confidence: float | None


@dataclass(frozen=True, slots=True)
class PlateRecognition(JsonSerializable):
    raw_text: str | None = None
    normalized_text: str | None = None
    confidence: float | None = None
    is_valid: bool = False


@dataclass(frozen=True, slots=True)
class CrossingTransition(JsonSerializable):
    track_id: int
    vehicle: VehicleDetection
    frame_index: int
    timestamp_seconds: float
    previous_point: Point
    current_point: Point
    from_side: int
    to_side: int
    direction: str


@dataclass(frozen=True, slots=True)
class VideoMetadata(JsonSerializable):
    input_path: str
    width: int
    height: int
    fps: float
    reported_total_frames: int | None
    duration_seconds: float | None


@dataclass(slots=True)
class LineCrossingEvent(JsonSerializable):
    event_id: str
    track_id: int
    vehicle_type: str
    confidence: float
    frame_index: int
    timestamp_seconds: float
    crossing_direction: str
    event_type: EventType = EventType.LINE_CROSSING_CANDIDATE
    status: EventStatus = EventStatus.PENDING_REVIEW
    plate_number: str | None = None
    plate_raw_text: str | None = None
    plate_confidence: float | None = None
    evidence_path: str | None = None
    plate_crop_path: str | None = None
    schema_version: str = SCHEMA_VERSION


@dataclass(slots=True)
class OutputArtifacts(JsonSerializable):
    result_json: str = "results.json"
    annotated_video: str | None = None
    legacy_csv: str | None = None
    legacy_sqlite: str | None = None


@dataclass(slots=True)
class ProcessingSummary(JsonSerializable):
    job_id: str
    status: ProcessingStatus
    input_video: VideoMetadata
    started_at: datetime
    finished_at: datetime | None = None
    processed_frames: int = 0
    total_candidate_events: int = 0
    error: str | None = None
    artifacts: OutputArtifacts = field(default_factory=OutputArtifacts)
    schema_version: str = SCHEMA_VERSION


@dataclass(slots=True)
class ProcessingResult(JsonSerializable):
    summary: ProcessingSummary
    events: list[LineCrossingEvent] = field(default_factory=list)
    schema_version: str = SCHEMA_VERSION
