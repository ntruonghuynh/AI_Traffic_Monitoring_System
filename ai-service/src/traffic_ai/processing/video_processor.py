"""Headless sequential video processing orchestration."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

from traffic_ai.config import ServiceConfig
from traffic_ai.detection.vehicle_detector import VehicleDetector
from traffic_ai.ocr.plate_detector import PlateDetector
from traffic_ai.ocr.plate_recognizer import PlateRecognizer
from traffic_ai.ocr.plate_validator import PlateValidator
from traffic_ai.processing.visualization import annotate_frame
from traffic_ai.schemas import (
    LineCrossingEvent,
    OutputArtifacts,
    PlateDetection,
    PlateCropReason,
    PlateRecognition,
    Point,
    ProcessingResult,
    ProcessingStatus,
    ProcessingSummary,
    VideoMetadata,
)
from traffic_ai.storage.result_writer import ResultWriter
from traffic_ai.tracking.vehicle_tracker import VehicleTracker
from traffic_ai.violation.line_crossing import LineCrossingDetector


LOGGER = logging.getLogger(__name__)


class VideoProcessingError(RuntimeError):
    pass


class VideoProcessor:
    def __init__(
        self,
        config: ServiceConfig,
        *,
        vehicle_tracker: VehicleTracker,
        plate_detector: PlateDetector,
        plate_recognizer: PlateRecognizer,
        plate_validator: PlateValidator,
    ) -> None:
        self.config = config
        self.vehicle_tracker = vehicle_tracker
        self.plate_detector = plate_detector
        self.plate_recognizer = plate_recognizer
        self.plate_validator = plate_validator

    def process(
        self,
        video_path: str | Path,
        output_dir: str | Path,
        *,
        job_id: str | None = None,
    ) -> ProcessingResult:
        input_path = Path(video_path).expanduser().resolve()
        if not input_path.is_file():
            raise FileNotFoundError(f"Input video not found: {input_path}")

        capture = cv2.VideoCapture(str(input_path))
        if not capture.isOpened():
            capture.release()
            raise VideoProcessingError(f"Cannot open input video: {input_path}")

        metadata = self._read_metadata(capture, input_path)
        line_start, line_end = self._line_points(metadata.width, metadata.height)
        line_detector = LineCrossingDetector(
            line_start,
            line_end,
            direction=self.config.line_crossing.direction,
            tolerance_pixels=self.config.line_crossing.tolerance_pixels,
            max_missing_frames=self.config.line_crossing.max_missing_frames,
            allow_multiple_crossings=self.config.line_crossing.allow_multiple_crossings,
        )
        writer = ResultWriter(output_dir, self.config.output)
        artifacts = OutputArtifacts(
            result_json="results.json",
            legacy_csv="violators.csv" if self.config.output.legacy_csv else None,
            legacy_sqlite="violations.db" if self.config.output.legacy_sqlite else None,
        )
        effective_job_id = job_id or str(uuid.uuid4())
        summary = ProcessingSummary(
            job_id=effective_job_id,
            status=ProcessingStatus.RUNNING,
            input_video=metadata,
            started_at=datetime.now(timezone.utc),
            artifacts=artifacts,
        )
        events: list[LineCrossingEvent] = []
        self.vehicle_tracker.reset()

        try:
            artifacts.annotated_video = writer.open_annotated_video(metadata)
            frame_index = 0
            while True:
                success, frame = capture.read()
                if not success:
                    break
                timestamp_seconds = frame_index / metadata.fps
                tracks = self.vehicle_tracker.update(frame, frame_index)
                transitions = line_detector.update(
                    tracks,
                    frame_index=frame_index,
                    timestamp_seconds=timestamp_seconds,
                )

                frame_events: list[LineCrossingEvent] = []
                frame_plates: list[PlateDetection] = []
                frame_event_plates: dict[str, PlateDetection] = {}
                frame_plate_crops: dict[str, Any] = {}
                for transition in transitions:
                    recognition, plate_detection, plate_crop, plate_crop_reason = self._recognize_plate(
                        frame,
                        transition.vehicle.bbox,
                        job_id=effective_job_id,
                        track_id=transition.track_id,
                    )
                    if plate_detection is not None:
                        frame_plates.append(plate_detection)
                    event = LineCrossingEvent(
                        event_id=str(uuid.uuid4()),
                        track_id=transition.track_id,
                        vehicle_type=transition.vehicle.class_name,
                        confidence=transition.vehicle.confidence,
                        plate_number=recognition.normalized_text,
                        plate_raw_text=recognition.raw_text,
                        plate_confidence=recognition.confidence,
                        frame_index=transition.frame_index,
                        timestamp_seconds=transition.timestamp_seconds,
                        crossing_direction=transition.direction,
                        plate_crop_reason=plate_crop_reason,
                    )
                    frame_events.append(event)
                    events.append(event)
                    if plate_detection is not None:
                        frame_event_plates[event.event_id] = plate_detection
                    if plate_crop is not None:
                        frame_plate_crops[event.event_id] = plate_crop

                rendered = annotate_frame(
                    frame,
                    line_start=line_start,
                    line_end=line_end,
                    tracks=tracks,
                    events=frame_events,
                    plates=frame_plates,
                )
                for event in frame_events:
                    evidence = annotate_frame(
                        frame,
                        line_start=line_start,
                        line_end=line_end,
                        tracks=tracks,
                        plates=([frame_event_plates[event.event_id]]
                                if event.event_id in frame_event_plates else []),
                        highlight_track_id=event.track_id,
                    )
                    event.evidence_path = writer.save_evidence(event.event_id, evidence)
                    plate_crop = frame_plate_crops.get(event.event_id)
                    if plate_crop is not None:
                        event.plate_crop_path = writer.save_plate_crop(event.event_id, plate_crop)
                writer.write_annotated_frame(rendered)

                frame_index += 1
                summary.processed_frames = frame_index
                summary.total_candidate_events = len(events)
                interval = self.config.output.progress_interval_frames
                if interval > 0 and frame_index % interval == 0:
                    LOGGER.info("Processed %d frames, %d candidate events", frame_index, len(events))

            if summary.processed_frames == 0:
                raise VideoProcessingError("Video opened but no frame could be decoded")
            summary.status = ProcessingStatus.COMPLETED
        except Exception as exc:
            LOGGER.exception("Video processing job failed")
            summary.status = ProcessingStatus.FAILED
            summary.error = f"{type(exc).__name__}: {exc}"
        finally:
            capture.release()
            writer.close()
            summary.finished_at = datetime.now(timezone.utc)

        result = ProcessingResult(summary=summary, events=events)
        writer.write_result(result)
        return result

    def _recognize_plate(
        self,
        frame: Any,
        vehicle_bbox: Any,
        *,
        job_id: str,
        track_id: int,
    ) -> tuple[PlateRecognition, PlateDetection | None, Any | None, PlateCropReason | None]:
        try:
            candidates = self.plate_detector.detect(frame, vehicle_bbox)
        except Exception as exc:
            LOGGER.warning(
                "Plate detection failed job_id=%s track_id=%s exception_type=%s",
                job_id,
                track_id,
                type(exc).__name__,
            )
            return PlateRecognition(), None, None, PlateCropReason.DETECTOR_ERROR
        if not candidates:
            return PlateRecognition(), None, None, PlateCropReason.NO_PLATE_DETECTED

        best_plate = max(candidates, key=lambda item: item.detection.confidence)
        height, width = best_plate.image.shape[:2]
        crop_size_is_valid = min(height, width) >= self.config.plate_detection.min_crop_size
        crop_for_output = best_plate.image if crop_size_is_valid else None
        crop_reason = None if crop_size_is_valid else PlateCropReason.TOO_SMALL
        if not crop_size_is_valid:
            LOGGER.info(
                "Plate crop below minimum job_id=%s track_id=%s width=%d height=%d min_crop_size=%d",
                job_id,
                track_id,
                width,
                height,
                self.config.plate_detection.min_crop_size,
            )
        try:
            ocr_candidates = self.plate_recognizer.recognize(best_plate.image)
        except Exception:
            LOGGER.warning("Plate pipeline failed for one candidate event", exc_info=True)
            return PlateRecognition(), best_plate.detection, crop_for_output, crop_reason
        return self.plate_validator.select_best(ocr_candidates), best_plate.detection, crop_for_output, crop_reason

    @staticmethod
    def _read_metadata(capture: Any, input_path: Path) -> VideoMetadata:
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if width <= 0 or height <= 0:
            raise VideoProcessingError("Video reports invalid dimensions")
        if fps <= 0:
            raise VideoProcessingError("Video reports invalid FPS")
        reported = total_frames if total_frames > 0 else None
        duration = reported / fps if reported is not None else None
        return VideoMetadata(
            input_path=input_path.name,
            width=width,
            height=height,
            fps=fps,
            reported_total_frames=reported,
            duration_seconds=duration,
        )

    def _line_points(self, width: int, height: int) -> tuple[Point, Point]:
        start = self.config.line_crossing.start
        end = self.config.line_crossing.end
        if self.config.line_crossing.normalized:
            return (
                Point(start[0] * (width - 1), start[1] * (height - 1)),
                Point(end[0] * (width - 1), end[1] * (height - 1)),
            )
        return Point(*start), Point(*end)


def build_processor(config: ServiceConfig) -> VideoProcessor:
    detector = VehicleDetector(
        config.vehicle_model_path,
        config.vehicle_detection.confidence,
        target_classes=config.vehicle_detection.target_classes,
        iou=config.vehicle_detection.iou,
        image_size=config.vehicle_detection.image_size,
        device=config.device,
    )
    tracker = VehicleTracker(
        detector,
        tracker_config=config.tracker_config_value,
        persist=config.tracking.persist,
        require_track_id=config.tracking.require_track_id,
        max_missing_frames=config.tracking.max_missing_frames,
    )
    plate_detector = PlateDetector(
        config.plate_model_path,
        config.plate_detection.confidence,
        iou=config.plate_detection.iou,
        image_size=config.plate_detection.image_size,
        device=config.device,
    )
    recognizer = PlateRecognizer(
        languages=config.ocr.languages,
        device=config.device,
        use_preprocessing=config.ocr.use_preprocessing,
    )
    validator = PlateValidator(min_confidence=config.ocr.min_confidence)
    return VideoProcessor(
        config,
        vehicle_tracker=tracker,
        plate_detector=plate_detector,
        plate_recognizer=recognizer,
        plate_validator=validator,
    )
