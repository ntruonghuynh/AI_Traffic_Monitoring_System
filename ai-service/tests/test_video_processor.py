import json
import logging
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np
import pytest

from traffic_ai.config import load_config
from traffic_ai.processing.video_processor import VideoProcessor
from traffic_ai.ocr.plate_detector import PlateCrop
from traffic_ai.ocr.plate_validator import PlateValidator
from traffic_ai.schemas import (
    BoundingBox,
    PlateCropReason,
    PlateDetection,
    ProcessingStatus,
    TrackedVehicle,
    VehicleDetection,
)


class FakeTracker:
    def reset(self):
        raise AssertionError("Tracker must not run for an invalid path")


class FakePlateComponent:
    pass


def test_invalid_video_path_fails_before_model_components(tmp_path: Path) -> None:
    processor = VideoProcessor(
        load_config("configs/default.yaml"),
        vehicle_tracker=FakeTracker(),  # type: ignore[arg-type]
        plate_detector=FakePlateComponent(),  # type: ignore[arg-type]
        plate_recognizer=FakePlateComponent(),  # type: ignore[arg-type]
        plate_validator=FakePlateComponent(),  # type: ignore[arg-type]
    )
    with pytest.raises(FileNotFoundError, match="Input video not found"):
        processor.process(tmp_path / "missing.mp4", tmp_path / "results")


class FakeCapture:
    def __init__(self):
        self.frames = [np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(3)]
        self.index = 0
        self.released = False

    def isOpened(self):
        return True

    def read(self):
        if self.index >= len(self.frames):
            return False, None
        frame = self.frames[self.index]
        self.index += 1
        return True, frame

    def get(self, property_id):
        return {
            cv2.CAP_PROP_FRAME_WIDTH: 100,
            cv2.CAP_PROP_FRAME_HEIGHT: 100,
            cv2.CAP_PROP_FPS: 10,
            cv2.CAP_PROP_FRAME_COUNT: 3,
        }[property_id]

    def release(self):
        self.released = True


class CrossingTracker:
    def reset(self):
        pass

    def update(self, frame, frame_index):
        bottom_y = (70, 40, 30)[frame_index]
        return [
            TrackedVehicle(
                track_id=4,
                detection=VehicleDetection(
                    BoundingBox(40, bottom_y - 20, 60, bottom_y),
                    0.9,
                    2,
                    "car",
                ),
            )
        ]


class NoPlateDetector:
    def detect(self, frame, bbox):
        return []


class RaisingPlateDetector:
    def detect(self, frame, bbox):
        raise RuntimeError("private detector detail")


class StaticPlateDetector:
    def __init__(self, image):
        self.image = image

    def detect(self, frame, bbox):
        return [
            PlateCrop(
                detection=PlateDetection(BoundingBox(42, 52, 58, 60), 0.95, 0, "license_plate"),
                image=self.image,
            )
        ]


class MultiPlateDetector:
    def __init__(self, low_confidence_image, high_confidence_image):
        self.low_confidence_image = low_confidence_image
        self.high_confidence_image = high_confidence_image

    def detect(self, frame, bbox):
        return [
            PlateCrop(PlateDetection(BoundingBox(40, 50, 50, 56), 0.4, 0, "license_plate"), self.low_confidence_image),
            PlateCrop(PlateDetection(BoundingBox(42, 52, 58, 60), 0.95, 0, "license_plate"), self.high_confidence_image),
        ]


class EmptyRecognizer:
    def __init__(self):
        self.calls = 0

    def recognize(self, image):
        self.calls += 1
        return []


class CapturingRecognizer(EmptyRecognizer):
    def recognize(self, image):
        self.image = image
        return super().recognize(image)


class RaisingRecognizer:
    def recognize(self, image):
        raise RuntimeError("OCR failed")


class MultiCrossingTracker:
    def reset(self):
        pass

    def update(self, frame, frame_index):
        bottom_y = (70, 40, 30)[frame_index]
        return [
            TrackedVehicle(
                track_id=track_id,
                detection=VehicleDetection(
                    BoundingBox(left, bottom_y - 20, left + 20, bottom_y),
                    0.9,
                    2,
                    "car",
                ),
            )
            for track_id, left in ((4, 20), (5, 60))
        ]


def run_processor(monkeypatch, tmp_path, *, detector, recognizer, tracker=None, config=None):
    fake_capture = FakeCapture()
    monkeypatch.setattr("traffic_ai.processing.video_processor.cv2.VideoCapture", lambda _: fake_capture)
    input_path = tmp_path / "input.mp4"
    input_path.write_bytes(b"synthetic-placeholder")
    processor = VideoProcessor(
        config or load_config("configs/default.yaml"),
        vehicle_tracker=tracker or CrossingTracker(),  # type: ignore[arg-type]
        plate_detector=detector,  # type: ignore[arg-type]
        plate_recognizer=recognizer,  # type: ignore[arg-type]
        plate_validator=PlateValidator(),
    )
    result = processor.process(input_path, tmp_path / "results", job_id="job-test")
    return result, tmp_path / "results"


def test_headless_pipeline_writes_json_and_evidence(monkeypatch, tmp_path: Path) -> None:
    fake_capture = FakeCapture()
    monkeypatch.setattr("traffic_ai.processing.video_processor.cv2.VideoCapture", lambda _: fake_capture)
    input_path = tmp_path / "input.mp4"
    input_path.write_bytes(b"synthetic-placeholder")
    output_path = tmp_path / "results"
    processor = VideoProcessor(
        load_config("configs/default.yaml"),
        vehicle_tracker=CrossingTracker(),  # type: ignore[arg-type]
        plate_detector=NoPlateDetector(),  # type: ignore[arg-type]
        plate_recognizer=FakePlateComponent(),  # type: ignore[arg-type]
        plate_validator=PlateValidator(),
    )

    result = processor.process(input_path, output_path, job_id="job-test")

    assert result.summary.status is ProcessingStatus.COMPLETED
    assert result.summary.processed_frames == 3
    assert result.summary.total_candidate_events == 1
    assert result.events[0].plate_number is None
    assert result.events[0].plate_crop_path is None
    assert result.events[0].plate_crop_reason is PlateCropReason.NO_PLATE_DETECTED
    payload = json.loads((output_path / "results.json").read_text(encoding="utf-8"))
    assert payload["events"][0]["plate_crop_reason"] == "NO_PLATE_DETECTED"
    assert (output_path / "results.json").is_file()
    assert (output_path / result.events[0].evidence_path).is_file()
    assert fake_capture.released is True


def test_plate_crop_is_written_and_serialized_when_ocr_returns_no_text(monkeypatch, tmp_path: Path) -> None:
    crop = np.full((24, 48, 3), 80, dtype=np.uint8)
    recognizer = EmptyRecognizer()
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=StaticPlateDetector(crop),
        recognizer=recognizer,
    )

    event = result.events[0]
    payload = json.loads((output_dir / "results.json").read_text(encoding="utf-8"))
    assert result.summary.schema_version == "1.2"
    assert payload["schema_version"] == "1.2"
    assert payload["summary"]["schema_version"] == "1.2"
    assert payload["events"][0]["schema_version"] == "1.2"
    assert event.plate_number is None
    assert event.plate_crop_path == f"evidence/{event.event_id}_plate.jpg"
    assert payload["events"][0]["plate_crop_path"] == event.plate_crop_path
    assert "plate_crop_reason" not in payload["events"][0]
    assert cv2.imread(str(output_dir / event.plate_crop_path)).shape[:2] == (24, 48)
    assert recognizer.calls == 1


def test_highest_confidence_plate_crop_is_the_same_image_sent_to_ocr(monkeypatch, tmp_path: Path) -> None:
    low = np.full((24, 48, 3), 20, dtype=np.uint8)
    high = np.full((24, 48, 3), 220, dtype=np.uint8)
    recognizer = CapturingRecognizer()
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=MultiPlateDetector(low, high),
        recognizer=recognizer,
    )

    event = result.events[0]
    stored_crop = cv2.imread(str(output_dir / event.plate_crop_path))
    assert recognizer.image is high
    assert float(stored_crop.mean()) > 180


def test_plate_crop_is_kept_when_ocr_raises(monkeypatch, tmp_path: Path) -> None:
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=StaticPlateDetector(np.zeros((24, 48, 3), dtype=np.uint8)),
        recognizer=RaisingRecognizer(),
    )
    event = result.events[0]
    assert event.plate_number is None
    assert event.plate_crop_path is not None
    assert (output_dir / event.plate_crop_path).is_file()


def test_too_small_plate_crop_is_not_saved_but_ocr_behavior_is_unchanged(
    monkeypatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    recognizer = EmptyRecognizer()
    config = load_config("configs/default.yaml")
    config = replace(
        config,
        plate_detection=replace(config.plate_detection, min_crop_size=21),
    )
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=StaticPlateDetector(np.zeros((20, 48, 3), dtype=np.uint8)),
        recognizer=recognizer,
        config=config,
    )
    assert result.events[0].plate_crop_path is None
    assert result.events[0].plate_crop_reason is PlateCropReason.TOO_SMALL
    payload = json.loads((output_dir / "results.json").read_text(encoding="utf-8"))
    assert payload["events"][0]["plate_crop_reason"] == "TOO_SMALL"
    assert "job_id=job-test track_id=4 width=48 height=20" in caplog.text
    assert recognizer.calls == 1
    assert not list((output_dir / "evidence").glob("*_plate.jpg"))


def test_detector_error_reason_logs_only_identifiers_and_exception_type(
    monkeypatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=RaisingPlateDetector(),
        recognizer=EmptyRecognizer(),
    )
    assert result.events[0].plate_crop_path is None
    assert result.events[0].plate_crop_reason is PlateCropReason.DETECTOR_ERROR
    payload = json.loads((output_dir / "results.json").read_text(encoding="utf-8"))
    assert payload["events"][0]["plate_crop_reason"] == "DETECTOR_ERROR"
    assert "job_id=job-test track_id=4 exception_type=RuntimeError" in caplog.text
    assert "private detector detail" not in caplog.text


def test_multiple_events_in_one_frame_get_distinct_crop_files(monkeypatch, tmp_path: Path) -> None:
    crop = np.zeros((24, 48, 3), dtype=np.uint8)
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=StaticPlateDetector(crop),
        recognizer=EmptyRecognizer(),
        tracker=MultiCrossingTracker(),
    )
    assert len(result.events) == 2
    paths = [event.plate_crop_path for event in result.events]
    assert len(set(paths)) == 2
    assert all(path is not None and (output_dir / path).is_file() for path in paths)
