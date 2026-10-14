"""License plate detection, OCR, and validation."""

from traffic_ai.ocr.plate_detector import PlateCrop, PlateDetector
from traffic_ai.ocr.plate_recognizer import PlateRecognizer
from traffic_ai.ocr.plate_validator import PlateValidator

__all__ = ["PlateCrop", "PlateDetector", "PlateRecognizer", "PlateValidator"]
