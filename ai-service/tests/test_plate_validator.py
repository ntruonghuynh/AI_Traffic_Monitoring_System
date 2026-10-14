import pytest

from traffic_ai.ocr.plate_validator import PlateValidator
from traffic_ai.schemas import OCRCandidate


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("30H-718.53", "30H-718.53"),
        ("59A1 12345", "59A1-123.45"),
        ("80NG-1234", "80NG-1234"),
        ("3OH7I853", "30H-718.53"),
    ],
)
def test_context_aware_normalization(raw: str, expected: str) -> None:
    assert PlateValidator().normalize(raw) == expected


def test_invalid_text_is_not_fabricated() -> None:
    assert PlateValidator().normalize("hello") is None
    assert PlateValidator().normalize("00A-12345") is None


def test_select_best_preserves_raw_and_rejects_low_confidence() -> None:
    validator = PlateValidator(min_confidence=0.5)
    result = validator.select_best([OCRCandidate("30H-718.53", 0.2)])
    assert result.raw_text == "30H-718.53"
    assert result.normalized_text is None
    assert result.is_valid is False


def test_unknown_result_uses_null_fields() -> None:
    result = PlateValidator().select_best([])
    assert result.raw_text is None
    assert result.normalized_text is None
    assert result.confidence is None
