from traffic_ai.config import default_config_path, load_config


def test_environment_model_and_device_overrides(monkeypatch) -> None:
    monkeypatch.setenv("TRAFFIC_AI_DEVICE", "cpu")
    monkeypatch.setenv("TRAFFIC_AI_VEHICLE_MODEL_PATH", "custom/vehicle.pt")
    config = load_config("configs/default.yaml")
    assert config.device == "cpu"
    assert config.vehicle_model_path.name == "vehicle.pt"
    assert config.line_crossing.direction == "positive_to_negative"
    assert config.plate_detection.min_crop_size == 20


def test_plate_crop_minimum_size_is_read_from_plate_detection_section(tmp_path) -> None:
    config_path = tmp_path / "custom.yaml"
    source = default_config_path().read_text(encoding="utf-8")
    assert source.count("  min_crop_size: 20\n") == 1
    config_path.write_text(source.replace("  min_crop_size: 20\n", "  min_crop_size: 32\n"), encoding="utf-8")
    assert load_config(config_path).plate_detection.min_crop_size == 32
