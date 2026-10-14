"""Traffic AI processing service."""

from traffic_ai.config import ServiceConfig, load_config
from traffic_ai.processing.video_processor import VideoProcessor

__all__ = ["ServiceConfig", "VideoProcessor", "load_config"]
__version__ = "0.1.0"
