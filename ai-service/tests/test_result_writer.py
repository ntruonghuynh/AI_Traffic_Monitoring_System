import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from traffic_ai.config import OutputConfig
from traffic_ai.schemas import (
    LineCrossingEvent,
    ProcessingResult,
    ProcessingStatus,
    ProcessingSummary,
    VideoMetadata,
)
from traffic_ai.storage.result_writer import ResultWriter


def test_writer_creates_json_evidence_and_optional_legacy_outputs(tmp_path: Path) -> None:
    writer = ResultWriter(
        tmp_path,
        OutputConfig(save_evidence_images=True, legacy_csv=True, legacy_sqlite=True),
    )
    event = LineCrossingEvent(
        event_id="event-1",
        track_id=1,
        vehicle_type="car",
        confidence=0.8,
        frame_index=10,
        timestamp_seconds=1.0,
        crossing_direction="positive_to_negative",
    )
    event.evidence_path = writer.save_evidence("event-1", np.zeros((20, 20, 3), dtype=np.uint8))
    summary = ProcessingSummary(
        job_id="job-1",
        status=ProcessingStatus.COMPLETED,
        input_video=VideoMetadata("input.mp4", 20, 20, 10.0, 20, 2.0),
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        processed_frames=20,
        total_candidate_events=1,
    )
    writer.write_result(ProcessingResult(summary=summary, events=[event]))
    writer.close()

    payload = json.loads((tmp_path / "results.json").read_text(encoding="utf-8"))
    assert payload["events"][0]["evidence_path"] == "evidence/event-1.jpg"
    with (tmp_path / "violators.csv").open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    assert rows[0]["event_id"] == "event-1"
    with sqlite3.connect(tmp_path / "violations.db") as connection:
        assert connection.execute("SELECT event_id FROM candidate_events").fetchone()[0] == "event-1"
