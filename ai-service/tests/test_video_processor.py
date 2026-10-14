from pathlib import Path

import cv2
import numpy as np
import pytest

from traffic_ai.config import load_config
from traffic_ai.processing.video_processor import VideoProcessor
from traffic_ai.ocr.plate_validator import PlateValidator
from traffic_ai.schemas import BoundingBox, ProcessingStatus, TrackedVehicle, VehicleDetection


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
    assert (output_path / "results.json").is_file()
    assert (output_path / result.events[0].evidence_path).is_file()
    assert fake_capture.released is True
