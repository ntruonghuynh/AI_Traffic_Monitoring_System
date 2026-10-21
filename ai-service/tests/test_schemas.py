import json
from datetime import datetime, timezone
from pathlib import Path

from traffic_ai.schemas import (
    EventStatus,
    EventType,
    LineCrossingEvent,
    ProcessingResult,
    ProcessingStatus,
    ProcessingSummary,
    VideoMetadata,
)


def test_json_contract_serializes_enums_nulls_and_schema_version(tmp_path: Path) -> None:
    event = LineCrossingEvent(
        event_id="e7a26411-6d09-4a64-bf99-773a61617a6f",
        track_id=12,
        vehicle_type="motorcycle",
        confidence=0.91,
        frame_index=125,
        timestamp_seconds=5.0,
        crossing_direction="positive_to_negative",
    )
    event.plate_crop_path = f"evidence/{event.event_id}_plate.jpg"
    summary = ProcessingSummary(
        job_id="c66fc789-a24e-4542-aa13-0ce6d4bbe5d1",
        status=ProcessingStatus.COMPLETED,
        input_video=VideoMetadata("video.mp4", 1920, 1080, 25.0, 250, 10.0),
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        finished_at=datetime(2026, 1, 1, 0, 0, 10, tzinfo=timezone.utc),
        processed_frames=250,
        total_candidate_events=1,
    )
    result_json = tmp_path / "results.json"
    result_json.write_text(ProcessingResult(summary=summary, events=[event]).to_json(), encoding="utf-8")
    payload = json.loads(result_json.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "1.2"
    assert payload["summary"]["schema_version"] == "1.2"
    assert payload["events"][0]["schema_version"] == "1.2"
    assert payload["events"][0]["plate_crop_path"] == f"evidence/{event.event_id}_plate.jpg"
    assert payload["events"][0]["event_type"] == EventType.LINE_CROSSING_CANDIDATE.value
    assert payload["events"][0]["status"] == EventStatus.PENDING_REVIEW.value
    assert payload["events"][0]["plate_number"] is None
    assert payload["summary"]["input_video"]["input_path"] == "video.mp4"
