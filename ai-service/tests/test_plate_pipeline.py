from types import SimpleNamespace

import numpy as np

from traffic_ai.ocr.plate_detector import PlateDetector
from traffic_ai.ocr.plate_recognizer import PlateRecognizer
from traffic_ai.schemas import BoundingBox


class FakePlateModel:
    names = {0: "license_plate"}

    def predict(self, **kwargs):
        box = SimpleNamespace(
            xyxy=np.array([[1.0, 2.0, 11.0, 7.0]]),
            cls=np.array([0.0]),
            conf=np.array([0.88]),
        )
        return [SimpleNamespace(boxes=[box])]


class FakeReader:
    def readtext(self, image, *, detail, paragraph):
        assert detail == 1
        assert paragraph is False
        return [([0, 0, 1, 1], "30H-718.53", 0.92), "fallback"]


def test_plate_detector_translates_roi_coordinates_to_frame() -> None:
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    detector = PlateDetector("unused.pt", 0.3, model=FakePlateModel())
    candidates = detector.detect(frame, BoundingBox(10, 20, 50, 60))
    assert len(candidates) == 1
    assert candidates[0].detection.bbox == BoundingBox(11, 22, 21, 27)
    assert candidates[0].image.shape == (5, 10, 3)
    assert candidates[0].detection.confidence == 0.88


def test_plate_recognizer_returns_raw_confidence_without_fabrication() -> None:
    recognizer = PlateRecognizer(reader=FakeReader(), use_preprocessing=False)
    candidates = recognizer.recognize(np.zeros((20, 40, 3), dtype=np.uint8))
    assert candidates[0].raw_text == "30H-718.53"
    assert candidates[0].confidence == 0.92
    assert candidates[1].raw_text == "fallback"
    assert candidates[1].confidence is None


def test_plate_preprocessing_produces_grayscale_image() -> None:
    processed = PlateRecognizer.preprocess(np.zeros((20, 40, 3), dtype=np.uint8))
    assert processed.shape == (20, 40)
