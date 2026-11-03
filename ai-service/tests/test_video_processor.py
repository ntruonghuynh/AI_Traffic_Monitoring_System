import json
import logging
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np
import pytest

from traffic_ai.config import load_config
from traffic_ai.processing.video_processor import VideoProcessor
from traffic_ai.processing.visualization import annotate_frame
from traffic_ai.ocr.plate_detector import PlateCrop
from traffic_ai.ocr.plate_validator import PlateValidator
from traffic_ai.schemas import (
    BoundingBox,
    PlateCropReason,
    PlateDetection,
    Point,
    ProcessingStatus,
    TrackedVehicle,
    VehicleDetection,
)


REAL_VIDEO_CAPTURE = cv2.VideoCapture


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


class PerVehiclePlateDetector:
    def __init__(self):
        self.crop = np.full((24, 32, 3), 80, dtype=np.uint8)

    def detect(self, frame, bbox):
        left = int(bbox.x1)
        return [
            PlateCrop(
                PlateDetection(BoundingBox(left + 4, 27, left + 16, 34), 0.95, 0, "license_plate"),
                self.crop,
            )
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


def test_annotated_video_is_transcoded_with_all_frames_and_scaled_width(monkeypatch, tmp_path: Path, caplog) -> None:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg is required to transcode annotated video")
    caplog.set_level(logging.INFO)
    config = load_config("configs/default.yaml")
    config = replace(
        config,
        output=replace(
            config.output,
            annotated_video=replace(config.output.annotated_video, enabled=True, max_width=64),
        ),
    )

    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=NoPlateDetector(),
        recognizer=EmptyRecognizer(),
        config=config,
    )

    video_path = output_dir / "annotated_video.mp4"
    assert result.summary.status is ProcessingStatus.COMPLETED
    assert result.summary.processed_frames == 3
    assert result.summary.artifacts.annotated_video == "annotated_video.mp4"
    assert video_path.is_file()
    capture = REAL_VIDEO_CAPTURE(str(video_path))
    assert capture.isOpened()
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    assert width == 64
    assert width % 2 == 0
    assert height % 2 == 0
    decoded_frames = 0
    while True:
        success, _frame = capture.read()
        if not success:
            break
        decoded_frames += 1
    capture.release()
    assert decoded_frames == result.summary.processed_frames == 3
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path:
        probe = subprocess.run(
            [
                ffprobe_path,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,pix_fmt",
                "-of",
                "json",
                str(video_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        stream = json.loads(probe.stdout)["streams"][0]
        assert stream["codec_name"] == "h264"
        assert stream["pix_fmt"] == "yuv420p"
    assert "Annotated video drawing completed job_id=job-test" in caplog.text
    assert "Annotated video encoded job_id=job-test" in caplog.text
    assert not list(output_dir.glob(".annotated-video-*.mp4"))


def test_annotated_video_is_skipped_without_ffmpeg_and_job_completes(monkeypatch, tmp_path: Path, caplog) -> None:
    monkeypatch.setattr("traffic_ai.storage.result_writer.shutil.which", lambda _name: None)
    caplog.set_level(logging.WARNING)

    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=NoPlateDetector(),
        recognizer=EmptyRecognizer(),
    )

    assert result.summary.status is ProcessingStatus.COMPLETED
    assert (output_dir / "results.json").is_file()
    assert result.summary.artifacts.annotated_video is None
    assert not (output_dir / "annotated_video.mp4").exists()
    assert "job_id=job-test" in caplog.text
    assert "brew install ffmpeg" in caplog.text


def test_annotated_video_can_be_disabled(monkeypatch, tmp_path: Path) -> None:
    config = load_config("configs/default.yaml")
    config = replace(
        config,
        output=replace(
            config.output,
            annotated_video=replace(config.output.annotated_video, enabled=False),
        ),
    )

    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=NoPlateDetector(),
        recognizer=EmptyRecognizer(),
        config=config,
    )

    assert result.summary.status is ProcessingStatus.COMPLETED
    assert result.summary.artifacts.annotated_video is None
    assert not (output_dir / "annotated_video.mp4").exists()


def test_annotated_video_draw_error_does_not_fail_job_or_change_evidence(
    monkeypatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    class FakeWriter:
        def __init__(self, path, _codec, _fps, _size):
            Path(path).write_bytes(b"temporary video")

        def isOpened(self):
            return True

        def write(self, _frame):
            pass

        def release(self):
            pass

    monkeypatch.setattr("traffic_ai.storage.result_writer.shutil.which", lambda _name: "/mock/ffmpeg")
    monkeypatch.setattr("traffic_ai.storage.result_writer.cv2.VideoWriter", FakeWriter)
    original_annotate_frame = annotate_frame

    def fail_video_annotation(*args, **kwargs):
        if kwargs.get("candidate_labels") is not None:
            raise OSError("simulated disk full detail")
        return original_annotate_frame(*args, **kwargs)

    monkeypatch.setattr("traffic_ai.processing.video_processor.annotate_frame", fail_video_annotation)
    caplog.set_level(logging.WARNING)

    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=NoPlateDetector(),
        recognizer=EmptyRecognizer(),
    )

    assert result.summary.status is ProcessingStatus.COMPLETED
    assert (output_dir / "results.json").is_file()
    assert (output_dir / result.events[0].evidence_path).is_file()
    assert result.summary.artifacts.annotated_video is None
    assert "job_id=job-test reason=annotation_draw_error exception_type=OSError" in caplog.text
    assert "simulated disk full detail" not in caplog.text


def test_annotated_video_transcode_error_does_not_fail_job(monkeypatch, tmp_path: Path, caplog) -> None:
    class FakeWriter:
        def __init__(self, path, _codec, _fps, _size):
            Path(path).write_bytes(b"temporary video")

        def isOpened(self):
            return True

        def write(self, _frame):
            pass

        def release(self):
            pass

    def fail_transcode(*_args, **_kwargs):
        raise OSError("simulated encoder failure")

    monkeypatch.setattr("traffic_ai.storage.result_writer.shutil.which", lambda _name: "/mock/ffmpeg")
    monkeypatch.setattr("traffic_ai.storage.result_writer.cv2.VideoWriter", FakeWriter)
    monkeypatch.setattr("traffic_ai.storage.result_writer.subprocess.run", fail_transcode)
    caplog.set_level(logging.WARNING)

    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=NoPlateDetector(),
        recognizer=EmptyRecognizer(),
    )

    assert result.summary.status is ProcessingStatus.COMPLETED
    assert (output_dir / "results.json").is_file()
    assert (output_dir / result.events[0].evidence_path).is_file()
    assert result.summary.artifacts.annotated_video is None
    assert "job_id=job-test reason=transcode_error exception_type=OSError" in caplog.text
    assert "simulated encoder failure" not in caplog.text
    assert not list(output_dir.glob(".annotated-video-*.mp4"))


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


def test_events_in_one_frame_get_separate_evidence_with_only_their_track_highlighted(
    monkeypatch, tmp_path: Path
) -> None:
    result, output_dir = run_processor(
        monkeypatch,
        tmp_path,
        detector=PerVehiclePlateDetector(),
        recognizer=EmptyRecognizer(),
        tracker=MultiCrossingTracker(),
    )

    assert len(result.events) == 2
    first, second = result.events
    assert first.frame_index == second.frame_index
    assert first.track_id == 4
    assert second.track_id == 5
    assert first.evidence_path != second.evidence_path

    first_image = cv2.imread(str(output_dir / first.evidence_path))
    second_image = cv2.imread(str(output_dir / second.evidence_path))
    assert first_image is not None
    assert second_image is not None

    def is_red(pixel: np.ndarray) -> bool:
        blue, green, red = (int(value) for value in pixel)
        return red > 140 and blue < 100 and green < 100

    def is_blue(pixel: np.ndarray) -> bool:
        blue, green, red = (int(value) for value in pixel)
        return blue > 140 and green < 100 and red < 100

    assert is_red(first_image[25, 20])
    assert not is_red(first_image[25, 60])
    assert is_red(second_image[25, 60])
    assert not is_red(second_image[25, 20])
    assert is_blue(first_image[27, 24])
    assert not is_blue(first_image[27, 64])
    assert is_blue(second_image[27, 64])
    assert not is_blue(second_image[27, 24])
    assert is_red(first_image[12, 25])
    assert is_red(second_image[12, 65])
    assert not np.array_equal(first_image, second_image)


def test_candidate_label_near_top_edge_stays_in_frame_without_covering_vehicle() -> None:
    frame = np.zeros((120, 500, 3), dtype=np.uint8)
    vehicle = TrackedVehicle(
        track_id=4,
        detection=VehicleDetection(BoundingBox(40, 2, 160, 80), 0.9, 2, "car"),
    )

    rendered = annotate_frame(
        frame,
        line_start=Point(0, 110),
        line_end=Point(499, 110),
        tracks=[vehicle],
        highlight_track_id=4,
    )

    assert tuple(int(value) for value in rendered[5, 165]) == (0, 0, 255)
    assert tuple(int(value) for value in rendered[20, 100]) == (0, 0, 0)


def test_annotated_frame_highlights_past_candidates_and_only_candidate_plate_boxes() -> None:
    frame = np.zeros((160, 200, 3), dtype=np.uint8)
    tracks = [
        TrackedVehicle(VehicleDetection(BoundingBox(20, 60, 60, 110), 0.9, 2, "car"), 1),
        TrackedVehicle(VehicleDetection(BoundingBox(100, 60, 140, 110), 0.8, 2, "car"), 2),
    ]
    plate = PlateDetection(BoundingBox(30, 80, 45, 90), 0.9, 0, "license_plate")

    rendered = annotate_frame(
        frame,
        line_start=Point(0, 145),
        line_end=Point(199, 145),
        tracks=tracks,
        candidate_labels={1: "car #1 PLATE 59A12345"},
        event_plates={1: plate},
        video_timestamp_seconds=61.0,
        event_count=2,
    )

    assert tuple(int(value) for value in rendered[80, 20]) == (0, 0, 255)
    assert tuple(int(value) for value in rendered[80, 100]) == (192, 192, 192)
    assert tuple(int(value) for value in rendered[80, 30]) == (255, 0, 0)
    assert tuple(int(value) for value in rendered[80, 45]) == (255, 0, 0)
