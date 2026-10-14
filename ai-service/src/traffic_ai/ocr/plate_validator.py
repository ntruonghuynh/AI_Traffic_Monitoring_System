"""Context-aware Vietnamese license plate normalization and validation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from traffic_ai.schemas import OCRCandidate, PlateRecognition


@dataclass(frozen=True, slots=True)
class _PlatePattern:
    roles: str
    prefix_length: int


class PlateValidator:
    """Normalize explicitly supported plate shapes without inventing characters."""

    DIGIT_CORRECTIONS = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "G": "6", "B": "8"}
    LETTER_CORRECTIONS = {"0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B"}
    PATTERNS = (
        _PlatePattern("DDLDDDD", 3),
        _PlatePattern("DDLDDDDD", 3),
        _PlatePattern("DDLLDDDD", 4),
        _PlatePattern("DDLDDDDDD", 4),
        _PlatePattern("DDLLDDDDD", 4),
    )

    def __init__(self, min_confidence: float = 0.35) -> None:
        self.min_confidence = min_confidence

    @staticmethod
    def clean(text: str) -> str:
        return re.sub(r"[^A-Z0-9]", "", text.upper())

    @classmethod
    def _apply_roles(cls, text: str, roles: str) -> tuple[str, int] | None:
        if len(text) != len(roles):
            return None
        output: list[str] = []
        corrections = 0
        for character, role in zip(text, roles):
            if role == "D":
                if character.isdigit():
                    output.append(character)
                elif character in cls.DIGIT_CORRECTIONS:
                    output.append(cls.DIGIT_CORRECTIONS[character])
                    corrections += 1
                else:
                    return None
            else:
                if "A" <= character <= "Z":
                    output.append(character)
                elif character in cls.LETTER_CORRECTIONS:
                    output.append(cls.LETTER_CORRECTIONS[character])
                    corrections += 1
                else:
                    return None
        corrected = "".join(output)
        if corrected[:2] == "00":
            return None
        return corrected, corrections

    @staticmethod
    def _format(corrected: str, pattern: _PlatePattern) -> str:
        prefix = corrected[: pattern.prefix_length]
        serial = corrected[pattern.prefix_length :]
        if len(serial) == 5:
            serial = f"{serial[:3]}.{serial[3:]}"
        return f"{prefix}-{serial}"

    def normalize(self, raw_text: str) -> str | None:
        cleaned = self.clean(raw_text)
        matches: list[tuple[int, str]] = []
        for pattern in self.PATTERNS:
            result = self._apply_roles(cleaned, pattern.roles)
            if result is None:
                continue
            corrected, corrections = result
            matches.append((corrections, self._format(corrected, pattern)))
        if not matches:
            return None
        matches.sort(key=lambda item: (item[0], item[1]))
        return matches[0][1]

    def select_best(self, candidates: Iterable[OCRCandidate]) -> PlateRecognition:
        ordered = sorted(
            candidates,
            key=lambda candidate: candidate.confidence if candidate.confidence is not None else -1.0,
            reverse=True,
        )
        if not ordered:
            return PlateRecognition()

        best_raw = ordered[0]
        for candidate in ordered:
            normalized = self.normalize(candidate.raw_text)
            confidence_ok = candidate.confidence is None or candidate.confidence >= self.min_confidence
            if normalized is not None and confidence_ok:
                return PlateRecognition(
                    raw_text=candidate.raw_text,
                    normalized_text=normalized,
                    confidence=candidate.confidence,
                    is_valid=True,
                )
        return PlateRecognition(
            raw_text=best_raw.raw_text,
            normalized_text=None,
            confidence=best_raw.confidence,
            is_valid=False,
        )
