"""YOLO license plate detector isolated from OCR and storage."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from traffic_ai.detection.vehicle_detector import ModelLoadError, _scalar
from traffic_ai.schemas import BoundingBox, PlateDetection


@dataclass(slots=True)
class PlateCrop:
    detection: PlateDetection
    image: Any


class PlateDetector:
    def __init__(
        self,
        model_path: str | Path,
        confidence: float,
        *,
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
        if model is None:
            if not self.model_path.is_file():
                raise ModelLoadError(f"License plate model not found: {self.model_path}")
            try:
                from ultralytics import YOLO

                model = YOLO(str(self.model_path))
            except Exception as exc:  # pragma: no cover - model runtime dependent
                raise ModelLoadError(f"Cannot load license plate model: {self.model_path}") from exc
        self._model = model

        names = getattr(model, "names", None)
        if names is None and getattr(model, "model", None) is not None:
            names = getattr(model.model, "names", None)
        if isinstance(names, dict):
            self.class_names = {int(key): str(value) for key, value in names.items()}
        elif isinstance(names, (list, tuple)):
            self.class_names = {index: str(value) for index, value in enumerate(names)}
        else:
            self.class_names = {0: "license_plate"}

    def detect(self, frame: Any, vehicle_bbox: BoundingBox) -> list[PlateCrop]:
        frame_height, frame_width = frame.shape[:2]
        clipped_vehicle = vehicle_bbox.clipped(width=frame_width, height=frame_height)
        x1, y1, x2, y2 = (
            int(clipped_vehicle.x1),
            int(clipped_vehicle.y1),
            int(clipped_vehicle.x2),
            int(clipped_vehicle.y2),
        )
        vehicle_roi = frame[y1:y2, x1:x2]
        if vehicle_roi.size == 0:
            return []

        kwargs: dict[str, Any] = {
            "source": vehicle_roi,
            "conf": self.confidence,
            "iou": self.iou,
            "imgsz": self.image_size,
            "verbose": False,
        }
        if self.device != "auto":
            kwargs["device"] = self.device
        results = self._model.predict(**kwargs)

        crops: list[PlateCrop] = []
        for result in results or []:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                coordinates = box.xyxy[0]
                values = coordinates.tolist() if hasattr(coordinates, "tolist") else list(coordinates)
                px1, py1, px2, py2 = map(float, values[:4])
                absolute = BoundingBox(
                    x1=x1 + px1,
                    y1=y1 + py1,
                    x2=x1 + px2,
                    y2=y1 + py2,
                ).clipped(width=frame_width, height=frame_height)
                ax1, ay1, ax2, ay2 = (
                    int(absolute.x1),
                    int(absolute.y1),
                    int(absolute.x2),
                    int(absolute.y2),
                )
                crop = frame[ay1:ay2, ax1:ax2].copy()
                if crop.size == 0:
                    continue
                class_id = int(_scalar(box.cls[0]))
                crops.append(
                    PlateCrop(
                        detection=PlateDetection(
                            bbox=absolute,
                            confidence=_scalar(box.conf[0]),
                            class_id=class_id,
                            class_name=self.class_names.get(class_id, "license_plate"),
                        ),
                        image=crop,
                    )
                )
        return sorted(crops, key=lambda item: item.detection.confidence, reverse=True)
