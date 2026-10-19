"""JSON-first result writer with optional legacy CSV and SQLite exports."""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path
from typing import Any

import cv2

from traffic_ai.config import OutputConfig
from traffic_ai.schemas import LineCrossingEvent, ProcessingResult, VideoMetadata


class ResultWriteError(RuntimeError):
    pass


class ResultWriter:
    def __init__(self, output_dir: str | Path, config: OutputConfig) -> None:
        self.output_dir = Path(output_dir).expanduser().resolve()
        self.config = config
        self.evidence_dir = self.output_dir / "evidence"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        if config.save_evidence_images:
            self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self._video_writer: Any | None = None

    def open_annotated_video(self, metadata: VideoMetadata) -> str | None:
        if not self.config.save_annotated_video:
            return None
        if len(self.config.video_codec) != 4:
            raise ResultWriteError("video_codec must contain exactly four characters")
        path = self.output_dir / "annotated_video.mp4"
        self._video_writer = cv2.VideoWriter(
            str(path),
            cv2.VideoWriter_fourcc(*self.config.video_codec),
            metadata.fps,
            (metadata.width, metadata.height),
        )
        if not self._video_writer.isOpened():
            self._video_writer = None
            raise ResultWriteError(f"Cannot create annotated video: {path}")
        return path.relative_to(self.output_dir).as_posix()

    def write_annotated_frame(self, frame: Any) -> None:
        if self._video_writer is not None:
            self._video_writer.write(frame)

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

    def close(self) -> None:
        if self._video_writer is not None:
            self._video_writer.release()
            self._video_writer = None

    def __enter__(self) -> ResultWriter:
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()
