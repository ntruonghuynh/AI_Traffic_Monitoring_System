"""YAML configuration loading and environment-specific overrides."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping


class ConfigError(ValueError):
    """Raised when service configuration is invalid."""


@dataclass(frozen=True, slots=True)
class VehicleDetectionConfig:
    model_path: str = "models/yolov8m.pt"
    confidence: float = 0.3
    iou: float = 0.5
    image_size: int = 640
    target_classes: tuple[str, ...] = ("car", "motorcycle", "bus", "truck")


@dataclass(frozen=True, slots=True)
class TrackingConfig:
    tracker_config: str = "bytetrack.yaml"
    persist: bool = True
    require_track_id: bool = True
    max_missing_frames: int = 30


@dataclass(frozen=True, slots=True)
class LineCrossingConfig:
    start: tuple[float, float] = (0.0, 0.48)
    end: tuple[float, float] = (1.0, 0.48)
    normalized: bool = True
    direction: str = "positive_to_negative"
    tolerance_pixels: float = 8.0
    max_missing_frames: int = 30
    allow_multiple_crossings: bool = False

    def __post_init__(self) -> None:
        allowed = {"both", "positive_to_negative", "negative_to_positive"}
        if self.direction not in allowed:
            raise ConfigError(f"Unsupported crossing direction: {self.direction}")
        if self.start == self.end:
            raise ConfigError("Line start and end must be different")
        if self.tolerance_pixels < 0:
            raise ConfigError("Line tolerance must be non-negative")


@dataclass(frozen=True, slots=True)
class PlateDetectionConfig:
    model_path: str = "models/license_plate_detector.pt"
    confidence: float = 0.3
    iou: float = 0.5
    image_size: int = 640
    min_crop_size: int = 20

    def __post_init__(self) -> None:
        if self.min_crop_size < 1:
            raise ConfigError("plate_detection.min_crop_size must be a positive integer")


@dataclass(frozen=True, slots=True)
class OCRConfig:
    languages: tuple[str, ...] = ("en", "vi")
    min_confidence: float = 0.35
    use_preprocessing: bool = True


@dataclass(frozen=True, slots=True)
class OutputConfig:
    save_evidence_images: bool = True
    save_annotated_video: bool = False
    video_codec: str = "mp4v"
    legacy_csv: bool = False
    legacy_sqlite: bool = False
    progress_interval_frames: int = 100


@dataclass(frozen=True, slots=True)
class ServiceConfig:
    device: str = "auto"
    vehicle_detection: VehicleDetectionConfig = field(default_factory=VehicleDetectionConfig)
    tracking: TrackingConfig = field(default_factory=TrackingConfig)
    line_crossing: LineCrossingConfig = field(default_factory=LineCrossingConfig)
    plate_detection: PlateDetectionConfig = field(default_factory=PlateDetectionConfig)
    ocr: OCRConfig = field(default_factory=OCRConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    base_dir: Path = field(default_factory=lambda: Path.cwd(), repr=False)

    def __post_init__(self) -> None:
        if self.device not in {"auto", "cpu", "cuda", "mps"}:
            raise ConfigError(f"Unsupported device: {self.device}")

    def resolve_path(self, value: str) -> Path:
        path = Path(value).expanduser()
        return path.resolve() if path.is_absolute() else (self.base_dir / path).resolve()

    @property
    def vehicle_model_path(self) -> Path:
        return self.resolve_path(self.vehicle_detection.model_path)

    @property
    def plate_model_path(self) -> Path:
        return self.resolve_path(self.plate_detection.model_path)

    @property
    def tracker_config_value(self) -> str:
        value = self.tracking.tracker_config
        if value in {"bytetrack.yaml", "botsort.yaml"}:
            return value
        return str(self.resolve_path(value))


def default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "configs" / "default.yaml"


def _section(mapping: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    value = mapping.get(name, {})
    if not isinstance(value, Mapping):
        raise ConfigError(f"Configuration section '{name}' must be a mapping")
    return value


def _pair(value: Any, name: str) -> tuple[float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ConfigError(f"'{name}' must contain exactly two numbers")
    return float(value[0]), float(value[1])


def _apply_environment(data: dict[str, Any]) -> None:
    overrides = {
        "TRAFFIC_AI_DEVICE": (None, "device"),
        "TRAFFIC_AI_VEHICLE_MODEL_PATH": ("vehicle_detection", "model_path"),
        "TRAFFIC_AI_PLATE_MODEL_PATH": ("plate_detection", "model_path"),
    }
    for env_name, (section, key) in overrides.items():
        value = os.getenv(env_name)
        if value is None:
            continue
        if section is None:
            data[key] = value
        else:
            data.setdefault(section, {})[key] = value


def load_config(path: str | Path | None = None) -> ServiceConfig:
    config_path = Path(path) if path is not None else default_config_path()
    config_path = config_path.expanduser().resolve()
    if not config_path.is_file():
        raise ConfigError(f"Configuration file not found: {config_path}")

    try:
        import yaml
    except ImportError as exc:  # pragma: no cover - installation issue
        raise ConfigError("PyYAML is required to load configuration") from exc

    with config_path.open("r", encoding="utf-8") as stream:
        loaded = yaml.safe_load(stream) or {}
    if not isinstance(loaded, dict):
        raise ConfigError("Top-level YAML value must be a mapping")
    _apply_environment(loaded)

    vehicle = _section(loaded, "vehicle_detection")
    tracking = _section(loaded, "tracking")
    crossing = _section(loaded, "line_crossing")
    plate = _section(loaded, "plate_detection")
    ocr = _section(loaded, "ocr")
    output = _section(loaded, "output")

    return ServiceConfig(
        device=str(loaded.get("device", "auto")),
        vehicle_detection=VehicleDetectionConfig(
            model_path=str(vehicle.get("model_path", "models/yolov8m.pt")),
            confidence=float(vehicle.get("confidence", 0.3)),
            iou=float(vehicle.get("iou", 0.5)),
            image_size=int(vehicle.get("image_size", 640)),
            target_classes=tuple(str(item) for item in vehicle.get("target_classes", ("car", "motorcycle", "bus", "truck"))),
        ),
        tracking=TrackingConfig(
            tracker_config=str(tracking.get("tracker_config", "bytetrack.yaml")),
            persist=bool(tracking.get("persist", True)),
            require_track_id=bool(tracking.get("require_track_id", True)),
            max_missing_frames=int(tracking.get("max_missing_frames", 30)),
        ),
        line_crossing=LineCrossingConfig(
            start=_pair(crossing.get("start", (0.0, 0.48)), "line_crossing.start"),
            end=_pair(crossing.get("end", (1.0, 0.48)), "line_crossing.end"),
            normalized=bool(crossing.get("normalized", True)),
            direction=str(crossing.get("direction", "positive_to_negative")),
            tolerance_pixels=float(crossing.get("tolerance_pixels", 8.0)),
            max_missing_frames=int(crossing.get("max_missing_frames", 30)),
            allow_multiple_crossings=bool(crossing.get("allow_multiple_crossings", False)),
        ),
        plate_detection=PlateDetectionConfig(
            model_path=str(plate.get("model_path", "models/license_plate_detector.pt")),
            confidence=float(plate.get("confidence", 0.3)),
            iou=float(plate.get("iou", 0.5)),
            image_size=int(plate.get("image_size", 640)),
            min_crop_size=int(plate.get("min_crop_size", 20)),
        ),
        ocr=OCRConfig(
            languages=tuple(str(item) for item in ocr.get("languages", ("en", "vi"))),
            min_confidence=float(ocr.get("min_confidence", 0.35)),
            use_preprocessing=bool(ocr.get("use_preprocessing", True)),
        ),
        output=OutputConfig(
            save_evidence_images=bool(output.get("save_evidence_images", True)),
            save_annotated_video=bool(output.get("save_annotated_video", False)),
            video_codec=str(output.get("video_codec", "mp4v")),
            legacy_csv=bool(output.get("legacy_csv", False)),
            legacy_sqlite=bool(output.get("legacy_sqlite", False)),
            progress_interval_frames=int(output.get("progress_interval_frames", 100)),
        ),
        base_dir=config_path.parent.parent,
    )
