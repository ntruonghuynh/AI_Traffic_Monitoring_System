"""Reusable Ultralytics vehicle detector with structured outputs."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from traffic_ai.schemas import BoundingBox, TrackedVehicle, VehicleDetection


class ModelLoadError(RuntimeError):
    """Raised when a model cannot be loaded or has incompatible labels."""


class DetectionError(RuntimeError):
    """Raised when vehicle inference fails."""


def _scalar(value: Any) -> float:
    if hasattr(value, "item"):
        return float(value.item())
    if isinstance(value, (list, tuple)):
        return float(value[0])
    return float(value)


class VehicleDetector:
    """YOLO adapter that owns model inference but no business/storage logic."""

    def __init__(
        self,
        model_path: str | Path,
        confidence: float,
        *,
        target_classes: Iterable[str],
        iou: float = 0.5,
        image_size: int = 640,
        device: str = "auto",
        model: Any | None = None,
    ) -> None:
        self.model_path = Path(model_path)
        self.confidence = confidence
        self.iou = iou
        self.image_size = image_size
        self.device = device
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")

        if model is None:
            if not self.model_path.is_file():
                raise ModelLoadError(f"Vehicle model not found: {self.model_path}")
            try:
                from ultralytics import YOLO

                model = YOLO(str(self.model_path))
            except Exception as exc:  # pragma: no cover - depends on model runtime
                raise ModelLoadError(f"Cannot load vehicle model: {self.model_path}") from exc
        self._model = model
        self.class_names = self._read_class_names(model)
        self.target_class_ids = self._resolve_target_classes(target_classes)

    @staticmethod
    def _read_class_names(model: Any) -> dict[int, str]:
        names = getattr(model, "names", None)
        if names is None and getattr(model, "model", None) is not None:
            names = getattr(model.model, "names", None)
        if isinstance(names, dict):
            return {int(key): str(value) for key, value in names.items()}
        if isinstance(names, (list, tuple)):
            return {index: str(value) for index, value in enumerate(names)}
        raise ModelLoadError("Vehicle model does not expose a valid 'names' mapping")

    def _resolve_target_classes(self, target_classes: Iterable[str]) -> tuple[int, ...]:
        lookup = {name.casefold(): class_id for class_id, name in self.class_names.items()}
        requested = tuple(name.casefold() for name in target_classes)
        missing = sorted(name for name in requested if name not in lookup)
        if missing:
            available = ", ".join(sorted(lookup))
            raise ModelLoadError(
                f"Vehicle classes not found in model: {missing}. Available classes: {available}"
            )
        return tuple(lookup[name] for name in requested)

    def _inference_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "conf": self.confidence,
            "iou": self.iou,
            "imgsz": self.image_size,
            "classes": list(self.target_class_ids),
            "verbose": False,
        }
        if self.device != "auto":
            kwargs["device"] = self.device
        return kwargs

    def detect(self, frame: Any) -> list[VehicleDetection]:
        try:
            results = self._model.predict(source=frame, **self._inference_kwargs())
        except Exception as exc:  # pragma: no cover - model runtime dependent
            raise DetectionError("Vehicle detection failed") from exc
        return [item.detection for item in self._parse(results, frame.shape)]

    def track(
        self,
        frame: Any,
        *,
        tracker_config: str,
        persist: bool,
    ) -> list[TrackedVehicle]:
        try:
            results = self._model.track(
                source=frame,
                tracker=tracker_config,
                persist=persist,
                **self._inference_kwargs(),
            )
        except Exception as exc:  # pragma: no cover - model runtime dependent
            raise DetectionError("Vehicle detection/tracking failed") from exc
        return self._parse(results, frame.shape)

    def _parse(self, results: Any, frame_shape: tuple[int, ...]) -> list[TrackedVehicle]:
        height, width = int(frame_shape[0]), int(frame_shape[1])
        parsed: list[TrackedVehicle] = []
        for result in results or []:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(_scalar(box.cls[0]))
                if class_id not in self.target_class_ids:
                    continue
                coordinates = box.xyxy[0]
                values = coordinates.tolist() if hasattr(coordinates, "tolist") else list(coordinates)
                bbox = BoundingBox(*map(float, values[:4])).clipped(width=width, height=height)
                confidence = _scalar(box.conf[0])
                raw_track_id = getattr(box, "id", None)
                track_id = None
                if raw_track_id is not None:
                    candidate = raw_track_id[0] if hasattr(raw_track_id, "__getitem__") else raw_track_id
                    track_id = int(_scalar(candidate))
                parsed.append(
                    TrackedVehicle(
                        detection=VehicleDetection(
                            bbox=bbox,
                            confidence=confidence,
                            class_id=class_id,
                            class_name=self.class_names[class_id].casefold(),
                        ),
                        track_id=track_id,
                    )
                )
        return parsed

    def reset_tracking_state(self) -> None:
        """Reset Ultralytics tracker state before processing another independent job."""

        predictor = getattr(self._model, "predictor", None)
        trackers = getattr(predictor, "trackers", None)
        if trackers:
            for tracker in trackers:
                reset = getattr(tracker, "reset", None)
                if callable(reset):
                    reset()
