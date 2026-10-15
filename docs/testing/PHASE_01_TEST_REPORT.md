# Phase 01 — Báo cáo kiểm thử Python AI Service

## Phạm vi

Pytest kiểm tra config, geometry, temporal line crossing, tracking state, plate pipeline/validator, schemas, result writer, detector adapter và video error handling. Real inference cần video cùng model weights được cấp rõ ràng và không được tự tải.

## Baseline lịch sử

| Nguồn | Ngày chạy | Kết quả | Coverage | Evidence |
|---|---|---:|---:|---|
| Báo cáo Phase 01 trước khi thiết lập hệ thống test | Không có dữ liệu | 27 passed, 1 skipped | 84% | `docs/PHASE_01_SUMMARY.md` |

Đây là kết quả lịch sử, không phải GitHub Actions run.

## Lần chạy tự động mới tại workspace

| Thuộc tính | Giá trị |
|---|---|
| Nguồn | Local automated |
| Ngày chạy | 2026-10-15 |
| Môi trường | macOS, Python 3.11.16, pytest 8.4.2 |
| Lệnh | `cd ai-service && ../.venv/bin/python -m pytest --cov=traffic_ai --cov-report=term-missing --cov-report=xml:test-results/coverage.xml --junitxml=test-results/pytest.xml` |
| Kết quả | `27 passed, 1 skipped` trong 28 tests collected |
| Coverage | Tổng line coverage `84%` (`950` statements, `154` missed) |
| Trạng thái unit test | `PASS` |
| Real inference integration | `SKIPPED` bởi pytest vì thiếu ba biến asset bắt buộc |
| Evidence | Terminal output của lần chạy; XML local trong `ai-service/test-results/` được Git ignore, không commit |

Test bị skip là `tests/integration/test_real_pipeline.py`. Nó chỉ chạy khi có đủ:

- `TRAFFIC_AI_INTEGRATION_VIDEO`
- `TRAFFIC_AI_VEHICLE_MODEL_PATH`
- `TRAFFIC_AI_PLATE_MODEL_PATH`

Không có model weights nào được tải trong lần chạy. Vì vậy, chưa có kết luận về độ chính xác OCR/detection, chất lượng tracking hoặc hiệu năng trên video thật.

## CI mới

Workflow `.github/workflows/python-ai-ci.yml` dùng Python 3.11, cài package với extra `dev`, chạy pytest/coverage trên CPU và upload JUnit/Coverage XML. Tại thời điểm lập báo cáo, workflow chưa chạy trên GitHub nên trạng thái CI là `NOT_RUN`.

Dependencies AI gồm OpenCV, Ultralytics, EasyOCR và CPU PyTorch transitive nên thời gian cài đặt có thể đáng kể. Asset-gated integration tiếp tục `SKIPPED` trong CI chuẩn; việc cấp weights/video phải qua một workflow được bảo vệ và tuân thủ quyền sử dụng dữ liệu.
