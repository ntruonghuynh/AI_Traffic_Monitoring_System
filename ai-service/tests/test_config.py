from traffic_ai.config import load_config


def test_environment_model_and_device_overrides(monkeypatch) -> None:
    monkeypatch.setenv("TRAFFIC_AI_DEVICE", "cpu")
    monkeypatch.setenv("TRAFFIC_AI_VEHICLE_MODEL_PATH", "custom/vehicle.pt")
    config = load_config("configs/default.yaml")
    assert config.device == "cpu"
    assert config.vehicle_model_path.name == "vehicle.pt"
    assert config.line_crossing.direction == "positive_to_negative"
