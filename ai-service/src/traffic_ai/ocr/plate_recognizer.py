"""Reusable EasyOCR reader with deterministic preprocessing."""

from __future__ import annotations

from typing import Any, Iterable

import cv2
import numpy as np

from traffic_ai.schemas import OCRCandidate


class OCRInitializationError(RuntimeError):
    pass


class PlateRecognizer:
    def __init__(
        self,
        *,
        languages: Iterable[str] = ("en", "vi"),
        device: str = "auto",
        use_preprocessing: bool = True,
        reader: Any | None = None,
    ) -> None:
        self.languages = tuple(languages)
        self.device = device
        self.use_preprocessing = use_preprocessing
        if reader is None:
            try:
                import easyocr
                import torch

                use_cuda = device == "cuda" or (device == "auto" and torch.cuda.is_available())
                reader = easyocr.Reader(list(self.languages), gpu=use_cuda)
            except Exception as exc:  # pragma: no cover - runtime/download dependent
                raise OCRInitializationError("Cannot initialize EasyOCR reader") from exc
        self._reader = reader

    @staticmethod
    def preprocess(image: Any) -> Any:
        if image is None or image.size == 0:
            raise ValueError("License plate image is empty")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image.copy()
        blurred = cv2.bilateralFilter(gray, 11, 17, 17)
        contrast = cv2.equalizeHist(blurred)
        binary = cv2.adaptiveThreshold(
            contrast,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11,
            2,
        )
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        sharpen_kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        return cv2.filter2D(closed, -1, sharpen_kernel)

    def recognize(self, image: Any) -> list[OCRCandidate]:
        if image is None or image.size == 0:
            return []
        prepared = self.preprocess(image) if self.use_preprocessing else image
        raw_results = self._reader.readtext(prepared, detail=1, paragraph=False)
        candidates: list[OCRCandidate] = []
        for result in raw_results:
            if isinstance(result, str):
                candidates.append(OCRCandidate(raw_text=result, confidence=None))
                continue
            if not isinstance(result, (tuple, list)) or len(result) < 2:
                continue
            confidence = float(result[2]) if len(result) > 2 and result[2] is not None else None
            candidates.append(OCRCandidate(raw_text=str(result[1]), confidence=confidence))
        return candidates
