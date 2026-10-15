export const JOB_ID = '22222222-2222-4222-8222-222222222222';
export const EVENT_ID = '33333333-3333-4333-8333-333333333333';

export function makeAiResult(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0',
    summary: {
      job_id: JOB_ID,
      status: 'COMPLETED',
      input_video: {
        input_path: 'sample.mp4',
        width: 1280,
        height: 720,
        fps: 25,
        reported_total_frames: 100,
        duration_seconds: 4,
      },
      started_at: '2026-10-15T01:00:00+00:00',
      finished_at: '2026-10-15T01:00:04+00:00',
      processed_frames: 100,
      total_candidate_events: 1,
      error: null,
      artifacts: {
        result_json: 'results.json',
        annotated_video: null,
        legacy_csv: null,
        legacy_sqlite: null,
      },
      schema_version: '1.0',
    },
    events: [
      {
        event_id: EVENT_ID,
        event_type: 'LINE_CROSSING_CANDIDATE',
        status: 'PENDING_REVIEW',
        track_id: 12,
        vehicle_type: 'motorcycle',
        confidence: 0.91,
        plate_number: null,
        plate_raw_text: null,
        plate_confidence: null,
        frame_index: 50,
        timestamp_seconds: 2,
        crossing_direction: 'positive_to_negative',
        evidence_path: 'evidence/event.jpg',
        schema_version: '1.0',
      },
    ],
    ...overrides,
  };
}
