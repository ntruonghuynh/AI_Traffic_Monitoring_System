import pytest

from traffic_ai.config import default_config_path, load_config


def test_environment_model_and_device_overrides(monkeypatch) -> None:
    monkeypatch.setenv("TRAFFIC_AI_DEVICE", "cpu")
    monkeypatch.setenv("TRAFFIC_AI_VEHICLE_MODEL_PATH", "custom/vehicle.pt")
    config = load_config("configs/default.yaml")
    assert config.device == "cpu"
    assert config.vehicle_model_path.name == "vehicle.pt"
    assert config.line_crossing.direction == "positive_to_negative"
    assert config.plate_detection.min_crop_size == 20
    assert config.output.annotated_video.enabled is True
    assert config.output.annotated_video.max_width == 1280
    assert config.output.annotated_video.crf == 23
    assert config.output.annotated_video.highlight_seconds == 3.0


def test_plate_crop_minimum_size_is_read_from_plate_detection_section(tmp_path) -> None:
    config_path = tmp_path / "custom.yaml"
    source = default_config_path().read_text(encoding="utf-8")
    assert source.count("  min_crop_size: 20\n") == 1
    config_path.write_text(source.replace("  min_crop_size: 20\n", "  min_crop_size: 32\n"), encoding="utf-8")
    assert load_config(config_path).plate_detection.min_crop_size == 32


def test_annotated_video_options_are_read_from_yaml(tmp_path) -> None:
    config_path = tmp_path / "custom.yaml"
    source = default_config_path().read_text(encoding="utf-8")
    source = source.replace("    enabled: true\n    max_width: 1280\n    crf: 23\n", "    enabled: false\n    max_width: null\n    crf: 31\n")
    config_path.write_text(source, encoding="utf-8")

    config = load_config(config_path)

    assert config.output.annotated_video.enabled is False
    assert config.output.annotated_video.max_width is None
    assert config.output.annotated_video.crf == 31


@pytest.mark.parametrize("value", ["0", "null"])
def test_annotated_video_highlight_can_be_disabled_from_yaml(tmp_path, value: str) -> None:
    config_path = tmp_path / "custom.yaml"
    source = default_config_path().read_text(encoding="utf-8")
    source = source.replace("    highlight_seconds: 3.0\n", f"    highlight_seconds: {value}\n")
    config_path.write_text(source, encoding="utf-8")

    config = load_config(config_path)

    assert config.output.annotated_video.highlight_seconds == (None if value == "null" else 0)
