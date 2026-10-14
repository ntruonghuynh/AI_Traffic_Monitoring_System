"""Opt-in integration test; no assets are downloaded automatically."""

from __future__ import annotations

import os
from dataclasses import replace
from pathlib import Path

import pytest

from traffic_ai.config import load_config
from traffic_ai.processing.video_processor import build_processor
from traffic_ai.schemas import ProcessingStatus


@pytest.mark.integration
def test_real_pipeline_when_assets_are_explicitly_supplied(monkeypatch, tmp_path: Path) -> None:
    video = os.getenv("TRAFFIC_AI_INTEGRATION_VIDEO")
    vehicle_model = os.getenv("TRAFFIC_AI_VEHICLE_MODEL_PATH")
    plate_model = os.getenv("TRAFFIC_AI_PLATE_MODEL_PATH")
    if not all((video, vehicle_model, plate_model)):
        pytest.skip("Set integration video and both model path environment variables")
    if not all(Path(path).is_file() for path in (video, vehicle_model, plate_model)):  # type: ignore[arg-type]
        pytest.skip("One or more integration assets do not exist")

    monkeypatch.setenv("TRAFFIC_AI_DEVICE", "cpu")
    config = load_config("configs/default.yaml")
    config = replace(
        config,
        output=replace(config.output, save_annotated_video=False, progress_interval_frames=0),
    )
    result = build_processor(config).process(video, tmp_path / "result")  # type: ignore[arg-type]
    assert result.summary.status is ProcessingStatus.COMPLETED
    assert (tmp_path / "result" / "results.json").is_file()
