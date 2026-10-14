# Phase 01 — Refactor AI Core Summary

## Kết quả

Phase 01 đã tạo một AI processing service modular trong `ai-service/`, giữ nguyên legacy source ở repository root và không thêm Frontend, NestJS, PostgreSQL, Redis hay Docker.

Service mới có thể được cài như Python package, chạy headless qua CLI và xuất JSON contract có version cho Backend tương lai.

## Files đã tạo

### Tài liệu

- `docs/PHASE_01_AUDIT.md`
- `docs/PHASE_01_SUMMARY.md`
- `ai-service/README.md`
- `ai-service/models/README.md`

### Package và configuration

- `ai-service/pyproject.toml`
- `ai-service/configs/default.yaml`
- `ai-service/configs/bytetrack.yaml`
- `ai-service/scripts/check_models.py`
- `ai-service/src/traffic_ai/__init__.py`
- `ai-service/src/traffic_ai/__main__.py`
- `ai-service/src/traffic_ai/config.py`
- `ai-service/src/traffic_ai/schemas.py`

### AI components

- `detection/vehicle_detector.py`
- `tracking/vehicle_tracker.py`
- `violation/line_crossing.py`
- `ocr/plate_detector.py`
- `ocr/plate_recognizer.py`
- `ocr/plate_validator.py`
- `processing/video_processor.py`
- `processing/visualization.py`
- `storage/result_writer.py`
- `utils/geometry.py`
- Các package `__init__.py` tương ứng.

### Tests

- `tests/test_geometry.py`
- `tests/test_line_crossing.py`
- `tests/test_tracking.py`
- `tests/test_plate_pipeline.py`
- `tests/test_plate_validator.py`
- `tests/test_result_writer.py`
- `tests/test_schemas.py`
- `tests/test_config.py`
- `tests/test_vehicle_detector.py`
- `tests/test_video_processor.py`
- `tests/integration/test_real_pipeline.py`

## Files đã thay đổi

- `README.md`: chuyển tài liệu chính sang AI service mới, giữ output minh họa và legacy notes.
- `requirements.txt`: thay snapshot 101 package bằng editable AI service và dependency trực tiếp cho legacy SORT demo.

Legacy Python files không bị xóa hoặc chỉnh sửa trong Phase 01.

## Quyết định kiến trúc

1. **ByteTrack qua Ultralytics:** tích hợp tự nhiên với YOLO result, bảo toàn class/confidence và duy trì state với `persist=True`. `sort.py` được giữ như legacy demo, không import vào service.
2. **JSON-first:** `results.json` là contract chính. CSV/SQLite chỉ là output compatibility tùy chọn.
3. **Dataclasses:** dùng typed standard-library dataclasses cho runtime/data contract, tránh thêm validation framework khi schema Phase 01 còn gọn.
4. **Dependency injection:** detector/tracker/OCR được inject vào `VideoProcessor`, cho phép unit test không cần weights.
5. **Temporal crossing:** bottom-center, signed line side, finite-segment intersection, tolerance, direction, expiry và one-event-per-track mặc định.
6. **Candidate semantics:** event là `LINE_CROSSING_CANDIDATE`/`PENDING_REVIEW`; không tuyên bố red-light violation khi thiếu signal state.
7. **OCR tại event:** plate detection/OCR chỉ chạy sau crossing candidate, không chạy mỗi frame.
8. **Context-aware validation:** normalize theo vai trò digit/letter của từng pattern, giữ raw text/confidence và trả `null` khi không đủ tin cậy.
9. **Headless mặc định:** visualization chỉ render vào evidence/video file, không mở GUI.
10. **Portable artifacts:** event UUID, job ID, UTC timestamps, schema version và relative paths.

## Lỗi/giới hạn cũ đã khắc phục trong service mới

- Không cò dùng `box.id` từ detection mode không tracking.
- Track ID `0` được xử lý hợp lệ; absent ID có behavior rõ ràng.
- Không tạo event liên tục chỉ vì bbox chạm vạch.
- Không gắn nhãn pháp lý “vượt đèn đỏ” khi chưa có signal state.
- Không load model/SQLite/EasyOCR bằng global mutable state khi import module.
- Không ép EasyOCR CUDA trên CPU/macOS.
- Không gán OCR confidence giả `1.0`.
- Không thay chữ thành số ở mọi vị trí.
- Validate model labels thay vì hardcode class ID mà không kiểm tra.
- Video path/dimensions/FPS/zero decoded frame có error handling và resource cleanup.
- Tách inference, business rule, visualization và persistence.

## Tests đã chạy

Lệnh:

```bash
cd ai-service
../.venv/bin/python -m pytest --cov=traffic_ai --cov-report=term-missing
```

Kết quả gần nhất:

- `27 passed`
- `1 skipped`: real integration test do chưa cung cấp weights/video qua environment variables.
- Total coverage: `84%`.
- Geometry, schemas, tracking wrapper, plate validator và core line-crossing: `90–100%`.
- Không download model weights trong test.

## Thay đổi behavior không thể tránh

- Entry point khuyến nghị chuyển từ `python traffic_violation_detection.py` sang `python -m traffic_ai --input ... --output ...`.
- Mặc định không mở cửa sổ video và không ghi CSV/SQLite.
- Event chỉ phát sinh khi một tracked bottom-center thực sự chuyển phía qua vạch, nên số record sẽ khác baseline cũ.
- OCR chỉ chạy tại candidate event; plate không hợp lệ trả `null` thay vì chuỗi `None`.
- Weights mặc định chuyển vào `ai-service/models/`; có environment override cho path cũ/ngoài service.

## Giới hạn còn lại

- Chưa chạy integration thật sau refactor vì nhánh clean không chứa weights/video. Không có claim accuracy hay benchmark performance.
- ByteTrack có thể ID-switch; duplicate prevention theo track không phải global vehicle re-identification.
- Chưa aggregation OCR nhiều frame/retry policy.
- Plate patterns đặc biệt chưa được hỗ trợ nếu không khai báo/test explicit.
- Chưa nhận diện đèn giao thông, hiệu chỉnh phối cảnh, ước lượng tốc độ hoặc multi-camera re-identification.
- `opencv-python` được dùng để tránh xung đột với dependency Ultralytics; Docker phase sau có thể chuyển sang headless build được kiểm soát.
- Cần review license của Ultralytics, EasyOCR, legacy SORT và model weights trước khi phân phối.

## Readiness cho Phase 02 — Database + Backend

AI core đã sẵn sàng ở mức contract/component để tích hợp Backend:

- JSON schema có version và nullable fields.
- Job/event IDs ổn định cho mapping sang PostgreSQL.
- Event/status semantics không trộn lẫn inference với review workflow.
- Artifact paths tương đối cho object/local storage abstraction.
- Processor độc lập, headless và không phụ thuộc web framework.
- Storage writer được tách, có thể thay bằng Backend callback/queue adapter sau này.

Trước Phase 02 production integration nên hoàn thành một real-asset acceptance run, chốt retention/privacy policy, chốt model/license provenance và version JSON schema bằng fixture chia sẻ giữa Python/NestJS.
