"""Validate configured model paths without loading model weights."""

from __future__ import annotations

import argparse

from traffic_ai.config import default_config_path, load_config


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(default_config_path()))
    args = parser.parse_args()
    config = load_config(args.config)
    paths = (config.vehicle_model_path, config.plate_model_path)
    missing = False
    for path in paths:
        state = "OK" if path.is_file() else "MISSING"
        print(f"[{state}] {path}")
        missing = missing or not path.is_file()
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
