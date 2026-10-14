from types import SimpleNamespace

import numpy as np
import pytest

from traffic_ai.detection.vehicle_detector import ModelLoadError, VehicleDetector


class FakeModel:
    names = {0: "person", 2: "car", 3: "motorcycle"}

    def __init__(self):
        self.kwargs = None

    def predict(self, **kwargs):
        self.kwargs = kwargs
        box = SimpleNamespace(
            xyxy=np.array([[1.0, 2.0, 20.0, 30.0]]),
            cls=np.array([2.0]),
            conf=np.array([0.91]),
            id=None,
        )
        return [SimpleNamespace(boxes=[box])]


def test_detector_resolves_actual_model_labels_and_returns_schema() -> None:
    model = FakeModel()
    detector = VehicleDetector(
        "unused.pt",
        0.4,
        target_classes=("car",),
        device="cpu",
        model=model,
    )
    detections = detector.detect(np.zeros((40, 50, 3), dtype=np.uint8))
    assert len(detections) == 1
    assert detections[0].class_id == 2
    assert detections[0].class_name == "car"
    assert detections[0].confidence == pytest.approx(0.91)
    assert model.kwargs["classes"] == [2]
    assert model.kwargs["device"] == "cpu"


def test_detector_rejects_class_missing_from_model() -> None:
    with pytest.raises(ModelLoadError, match="Vehicle classes not found"):
        VehicleDetector("unused.pt", 0.3, target_classes=("truck",), model=FakeModel())
