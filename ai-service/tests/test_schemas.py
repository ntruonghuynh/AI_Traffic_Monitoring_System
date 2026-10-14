import json
from datetime import datetime, timezone

from traffic_ai.schemas import (
    EventStatus,
    EventType,
    LineCrossingEvent,
    ProcessingResult,
    ProcessingStatus,
    ProcessingSummary,
    VideoMetadata,
)


def test_json_contract_serializes_enums_nulls_and_schema_version() -> None:
    event = LineCrossingEvent(
        event_id="event-1",
        track_id=12,
        vehicle_type="motorcycle",
        confidence=0.91,
        frame_index=125,
        timestamp_seconds=5.0,
        crossing_direction="positive_to_negative",
    )
    summary = ProcessingSummary(
        job_id="job-1",
        status=ProcessingStatus.COMPLETED,
        input_video=VideoMetadata("video.mp4", 1920, 1080, 25.0, 250, 10.0),
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        finished_at=datetime(2026, 1, 1, 0, 0, 10, tzinfo=timezone.utc),
        processed_frames=250,
        total_candidate_events=1,
    )
    payload = json.loads(ProcessingResult(summary=summary, events=[event]).to_json())
    assert payload["schema_version"] == "1.0"
    assert payload["events"][0]["event_type"] == EventType.LINE_CROSSING_CANDIDATE.value
    assert payload["events"][0]["status"] == EventStatus.PENDING_REVIEW.value
    assert payload["events"][0]["plate_number"] is None
    assert payload["summary"]["input_video"]["input_path"] == "video.mp4"
