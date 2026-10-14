"""Command-line entry point for the Traffic AI service."""

from __future__ import annotations

import argparse
import logging
from dataclasses import replace

from traffic_ai.config import ConfigError, default_config_path, load_config
from traffic_ai.processing.video_processor import build_processor
from traffic_ai.schemas import ProcessingStatus


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Process a traffic video with the modular AI pipeline")
    parser.add_argument("--input", required=True, help="Path to a local input video")
    parser.add_argument("--output", required=True, help="Directory for JSON and evidence artifacts")
    parser.add_argument("--config", default=str(default_config_path()), help="Path to YAML configuration")
    parser.add_argument("--job-id", help="Optional caller-provided processing job ID")
    parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), help="Override inference device")
    parser.add_argument("--annotated-video", action="store_true", help="Write annotated_video.mp4")
    parser.add_argument("--no-evidence", action="store_true", help="Disable evidence JPEG output")
    parser.add_argument("--log-level", default="INFO", choices=("DEBUG", "INFO", "WARNING", "ERROR"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        config = load_config(args.config)
        if args.device:
            config = replace(config, device=args.device)
        if args.annotated_video or args.no_evidence:
            config = replace(
                config,
                output=replace(
                    config.output,
                    save_annotated_video=args.annotated_video or config.output.save_annotated_video,
                    save_evidence_images=False if args.no_evidence else config.output.save_evidence_images,
                ),
            )
        processor = build_processor(config)
        result = processor.process(args.input, args.output, job_id=args.job_id)
    except (ConfigError, FileNotFoundError, RuntimeError, ValueError) as exc:
        logging.getLogger(__name__).error("Cannot start processing: %s", exc)
        return 2

    print(result.summary.to_json())
    return 0 if result.summary.status is ProcessingStatus.COMPLETED else 1


if __name__ == "__main__":
    raise SystemExit(main())
