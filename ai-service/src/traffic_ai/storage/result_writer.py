"""JSON-first result writer with optional legacy CSV and SQLite exports."""

from __future__ import annotations

import csv
import logging
import shutil
import sqlite3
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import cv2

from traffic_ai.config import OutputConfig
from traffic_ai.schemas import LineCrossingEvent, ProcessingResult, VideoMetadata


class ResultWriteError(RuntimeError):
    pass


LOGGER = logging.getLogger(__name__)


class ResultWriter:
    def __init__(self, output_dir: str | Path, config: OutputConfig, *, job_id: str = "unknown") -> None:
        self.output_dir = Path(output_dir).expanduser().resolve()
        self.config = config
        self.job_id = job_id
        self.evidence_dir = self.output_dir / "evidence"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        if config.save_evidence_images:
            self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self._video_writer: Any | None = None
        self._ffmpeg_path: str | None = None
        self._annotated_source_path: Path | None = None
        self._annotated_temp_path: Path | None = None
        self._annotated_destination = self.output_dir / "annotated_video.mp4"
        self.annotated_frame_size: tuple[int, int] | None = None

    def open_annotated_video(self, metadata: VideoMetadata, *, job_id: str | None = None) -> bool:
        if job_id is not None:
            self.job_id = job_id
        config = self.config.annotated_video
        if not config.enabled:
            return False
        try:
            self._ffmpeg_path = shutil.which("ffmpeg")
        except Exception as exc:
            self._warn_annotated_video(f"ffmpeg_lookup_error exception_type={type(exc).__name__}")
            return False
        if not self._ffmpeg_path:
            LOGGER.warning(
                "Annotated video skipped job_id=%s: ffmpeg is not installed; install it with `brew install ffmpeg`.",
                self.job_id,
            )
            return False

        width = metadata.width
        height = metadata.height
        if config.max_width is not None:
            width_limit = config.max_width if config.max_width % 2 == 0 else config.max_width - 1
            if width > width_limit:
                width = width_limit
                height = max(2, int(round(metadata.height * width / metadata.width)))
        self.annotated_frame_size = (width, height)
        self._annotated_source_path = self.output_dir / f".annotated-video-source-{uuid.uuid4().hex}.mp4"
        self._annotated_temp_path = self.output_dir / f".annotated-video-final-{uuid.uuid4().hex}.mp4"
        try:
            self._video_writer = cv2.VideoWriter(
                str(self._annotated_source_path),
                cv2.VideoWriter_fourcc(*"mp4v"),
                metadata.fps,
                self.annotated_frame_size,
            )
            if not self._video_writer.isOpened():
                self._discard_annotated_video("opencv_writer_unavailable")
                return False
        except Exception as exc:
            self._discard_annotated_video(f"opencv_writer_error exception_type={type(exc).__name__}")
            return False
        return True

    @property
    def annotated_video_active(self) -> bool:
        return self._video_writer is not None

    def skip_annotated_video(self, reason: str) -> None:
        self._discard_annotated_video(reason)

    def write_annotated_frame(self, frame: Any) -> None:
        if self._video_writer is not None:
            try:
                self._video_writer.write(frame)
            except Exception as exc:
                self._discard_annotated_video(f"frame_write_error exception_type={type(exc).__name__}")

    def close(self) -> str | None:
        if self._video_writer is None:
            return None
        try:
            self._video_writer.release()
        except Exception as exc:
            self._warn_annotated_video(f"writer_release_error exception_type={type(exc).__name__}")
            self._cleanup_annotated_temp_files()
            self._video_writer = None
            return None
        self._video_writer = None

        encode_started = time.perf_counter()
        try:
            if not self._annotated_source_path or not self._annotated_source_path.is_file():
                self._warn_annotated_video("temporary_video_missing")
                return None
            if self._annotated_source_path.stat().st_size == 0:
                self._warn_annotated_video("temporary_video_empty")
                return None
            if not self._ffmpeg_path or not self._annotated_temp_path:
                self._warn_annotated_video("ffmpeg_unavailable_after_recording")
                return None
            subprocess.run(
                [
                    self._ffmpeg_path,
                    "-y",
                    "-i",
                    str(self._annotated_source_path),
                    "-an",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-preset",
                    "veryfast",
                    "-crf",
                    str(self.config.annotated_video.crf),
                    "-movflags",
                    "+faststart",
                    "-vf",
                    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                    str(self._annotated_temp_path),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not self._annotated_temp_path.is_file() or self._annotated_temp_path.stat().st_size == 0:
                self._warn_annotated_video("transcoded_video_empty")
                return None
            self._annotated_temp_path.replace(self._annotated_destination)
            duration = time.perf_counter() - encode_started
            size_bytes = self._annotated_destination.stat().st_size
            LOGGER.info(
                "Annotated video encoded job_id=%s encode_seconds=%.3f size_bytes=%d",
                self.job_id,
                duration,
                size_bytes,
            )
            return self._annotated_destination.relative_to(self.output_dir).as_posix()
        except subprocess.CalledProcessError as exc:
            self._warn_annotated_video(f"ffmpeg_failed returncode={exc.returncode}")
            return None
        except Exception as exc:
            self._warn_annotated_video(f"transcode_error exception_type={type(exc).__name__}")
            return None
        finally:
            self._cleanup_annotated_temp_files()

    def _warn_annotated_video(self, reason: str) -> None:
        LOGGER.warning("Annotated video skipped job_id=%s reason=%s", self.job_id, reason)

    def _discard_annotated_video(self, reason: str) -> None:
        self._warn_annotated_video(reason)
        try:
            if self._video_writer is not None:
                self._video_writer.release()
        except Exception:
            pass
        self._video_writer = None
        self._cleanup_annotated_temp_files()

    def _cleanup_annotated_temp_files(self) -> None:
        for path in (self._annotated_source_path, self._annotated_temp_path):
            if path is None:
                continue
            try:
                path.unlink(missing_ok=True)
            except OSError:
                self._warn_annotated_video("temporary_file_cleanup_failed")
        self._annotated_source_path = None
        self._annotated_temp_path = None

    def save_evidence(self, event_id: str, frame: Any) -> str | None:
        if not self.config.save_evidence_images:
            return None
        path = self.evidence_dir / f"{event_id}.jpg"
        if not cv2.imwrite(str(path), frame):
            raise ResultWriteError(f"Cannot write evidence image: {path}")
        return path.relative_to(self.output_dir).as_posix()

    def save_plate_crop(self, event_id: str, image: Any) -> str | None:
        if not self.config.save_evidence_images:
            return None
        if not event_id or event_id in {".", ".."} or "/" in event_id or "\\" in event_id:
            raise ResultWriteError("event_id must be a safe filename component")
        relative_path = Path("evidence") / f"{event_id}_plate.jpg"
        path = (self.output_dir / relative_path).resolve()
        if not path.is_relative_to(self.output_dir):
            raise ResultWriteError("Plate crop path escapes output directory")
        if not cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 95]):
            raise ResultWriteError(f"Cannot write plate crop: {path}")
        return relative_path.as_posix()

    def write_result(self, result: ProcessingResult) -> Path:
        destination = self.output_dir / "results.json"
        temporary = destination.with_suffix(".json.tmp")
        temporary.write_text(result.to_json(indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
        if self.config.legacy_csv:
            self._write_legacy_csv(result.events)
        if self.config.legacy_sqlite:
            self._write_legacy_sqlite(result.events)
        return destination

    def _write_legacy_csv(self, events: list[LineCrossingEvent]) -> None:
        path = self.output_dir / "violators.csv"
        with path.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(["event_id", "vehicle_type", "plate_number", "frame_index", "timestamp_seconds"])
            for event in events:
                writer.writerow(
                    [
                        event.event_id,
                        event.vehicle_type,
                        event.plate_number or "",
                        event.frame_index,
                        event.timestamp_seconds,
                    ]
                )

    def _write_legacy_sqlite(self, events: list[LineCrossingEvent]) -> None:
        path = self.output_dir / "violations.db"
        with sqlite3.connect(path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS candidate_events (
                    event_id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    track_id INTEGER NOT NULL,
                    vehicle_type TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    plate_number TEXT,
                    frame_index INTEGER NOT NULL,
                    timestamp_seconds REAL NOT NULL,
                    evidence_path TEXT
                )
                """
            )
            connection.executemany(
                """
                INSERT OR REPLACE INTO candidate_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        event.event_id,
                        event.event_type.value,
                        event.status.value,
                        event.track_id,
                        event.vehicle_type,
                        event.confidence,
                        event.plate_number,
                        event.frame_index,
                        event.timestamp_seconds,
                        event.evidence_path,
                    )
                    for event in events
                ],
            )

    def __enter__(self) -> ResultWriter:
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()
