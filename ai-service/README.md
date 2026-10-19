# Traffic AI Service

`traffic-ai-service` là AI core độc lập cho hệ thống giám sát giao thông. Service xử lý video tuần tự, theo dõi phương tiện, phát hiện sự kiện cắt qua vạch, chạy plate detection/OCR tại candidate event và ghi JSON contract cho Backend tương lai.

Service không xác nhận vi phạm pháp lý. Khi chưa có traffic-light state, mọi crossing chỉ mang loại `LINE_CROSSING_CANDIDATE` và status `PENDING_REVIEW`.

## Kiến trúc

```text
Input video
    |
    v
VehicleDetector (YOLO) + VehicleTracker (ByteTrack)
    |
    v
LineCrossingDetector (bottom-center + temporal state + hysteresis)
    |
    v
PlateDetector (YOLO) -> PlateRecognizer (EasyOCR) -> PlateValidator
    |
    v
ResultWriter -> results.json + evidence/*.jpg + optional annotated video
```

Model adapters không chứa business rule hay storage. Line-crossing không phụ thuộc YOLO/OCR. Visualization và result writer được tách khỏi inference.

## Cấu trúc thư mục

```text
ai-service/
├── configs/
│   ├── default.yaml
│   └── bytetrack.yaml
├── models/
│   └── README.md
├── scripts/
│   └── check_models.py
├── src/traffic_ai/
│   ├── config.py
│   ├── schemas.py
│   ├── detection/
│   ├── tracking/
│   ├── violation/
│   ├── ocr/
│   ├── processing/
│   ├── storage/
│   └── utils/
├── tests/
└── pyproject.toml
```

## Yêu cầu

- Python 3.10–3.12; khuyến nghị Python 3.11.
- Model vehicle YOLO có labels `car`, `motorcycle`, `bus`, `truck` hoặc danh sách class được cấu hình tương ứng.
- Model YOLO license plate tương thích Ultralytics.
- PyTorch build phù hợp CPU/CUDA/MPS của máy.

## Cài đặt

Từ repository root:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "ai-service[dev]"
```

Trên Windows:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -e "ai-service[dev]"
```

Nếu dùng NVIDIA GPU, cài PyTorch/CUDA phù hợp môi trường trước khi cài service. Không dùng wheel `+cu118` trên macOS.

## Model setup

Weights không nằm trong Git. Đặt tại:

```text
ai-service/models/yolov8m.pt
ai-service/models/license_plate_detector.pt
```

Hoặc override bằng environment variables:

```bash
export TRAFFIC_AI_VEHICLE_MODEL_PATH=/absolute/path/yolov8m.pt
export TRAFFIC_AI_PLATE_MODEL_PATH=/absolute/path/license_plate_detector.pt
export TRAFFIC_AI_DEVICE=cpu
```

Kiểm tra path mà không load model:

```bash
python ai-service/scripts/check_models.py
```

## Configuration

File mặc định: `ai-service/configs/default.yaml`.

Các nhóm chính:

- `vehicle_detection`: model, confidence, IoU, image size, target class names.
- `tracking`: ByteTrack YAML, persistence và thời gian giữ state.
- `line_crossing`: hai điểm vạch, direction, tolerance, duplicate policy.
- `plate_detection`: model, threshold và `min_crop_size` (cạnh nhỏ nhất để lưu crop biển số; mặc định `20` px, có thể override trong YAML).
- `ocr`: languages, confidence tối thiểu, preprocessing.
- `output`: evidence, annotated video, CSV/SQLite compatibility và progress interval.

Mặc định vạch dùng normalized coordinates. Với line từ trái sang phải, `positive_to_negative` nghĩa là bottom-center di chuyển từ phía dưới lên phía trên vạch.

## Chạy video

Sau khi cài editable package:

```bash
python -m traffic_ai \
  --input /path/to/input.mp4 \
  --output /path/to/results
```

Ghi thêm annotated video và chọn CPU:

```bash
python -m traffic_ai \
  --input /path/to/input.mp4 \
  --output /path/to/results \
  --device cpu \
  --annotated-video
```

Có thể dùng console script tương đương:

```bash
traffic-ai --input /path/to/input.mp4 --output /path/to/results
```

Pipeline mặc định headless, không gọi `cv2.imshow()`.

## Output contract

```text
results/
├── results.json
├── evidence/
│   ├── <event_uuid>.jpg
│   └── <event_uuid>_plate.jpg   # crop biển số nếu detector tìm thấy crop đủ kích thước
└── annotated_video.mp4   # chỉ khi bật
```

Event mẫu:

```json
{
  "event_id": "e7a26411-6d09-4a64-bf99-773a61617a6f",
  "event_type": "LINE_CROSSING_CANDIDATE",
  "status": "PENDING_REVIEW",
  "track_id": 12,
  "vehicle_type": "motorcycle",
  "confidence": 0.91,
  "plate_number": "59A1-123.45",
  "plate_raw_text": "59A1 12345",
  "plate_confidence": 0.87,
  "frame_index": 125,
  "timestamp_seconds": 5.0,
  "crossing_direction": "positive_to_negative",
  "evidence_path": "evidence/e7a26411-6d09-4a64-bf99-773a61617a6f.jpg",
  "plate_crop_path": "evidence/e7a26411-6d09-4a64-bf99-773a61617a6f_plate.jpg",
  "schema_version": "1.1"
}
```

Root, `summary` và mọi event dùng `schema_version: "1.1"`. `plate_crop_path` là đường dẫn tương đối hoặc `null`: service lưu crop có confidence detector cao nhất (cũng là crop đưa vào OCR), kể cả khi OCR không tìm được chữ hoặc ném exception. Nếu detector không tìm thấy biển hoặc cạnh crop nhỏ hơn `plate_detection.min_crop_size`, trường này là `null`. Ảnh crop được ghi JPEG chất lượng 95, không resize.

Khi OCR không đủ tin cậy, `plate_number` là `null`; raw text/confidence được giữ nếu có. Service không tạo giả biển số. Ảnh crop biển số có thể chứa dữ liệu cá nhân; cần kiểm soát quyền truy cập, lưu trữ và thời hạn giữ phù hợp.

`summary` chứa job ID, status, video metadata, thời gian UTC, số frame, số candidate, error và relative artifact paths. Toàn bộ contract có `schema_version`.

## Chạy test

```bash
cd ai-service
../.venv/bin/python -m pytest
../.venv/bin/python -m pytest --cov=traffic_ai --cov-report=term-missing
```

Unit tests không tải weights. Integration test chỉ chạy khi có asset local:

```bash
export TRAFFIC_AI_INTEGRATION_VIDEO=/path/to/video.mp4
export TRAFFIC_AI_VEHICLE_MODEL_PATH=/path/to/yolov8m.pt
export TRAFFIC_AI_PLATE_MODEL_PATH=/path/to/license_plate_detector.pt
../.venv/bin/python -m pytest -m integration
```

## Legacy compatibility

`output.legacy_csv` và `output.legacy_sqlite` mặc định tắt. Khi bật, writer tạo `violators.csv` và `violations.db` trong result directory. JSON vẫn là contract chính.

Source cũ ở repository root được giữ nguyên trong Phase 01 để đối chiếu. `sort.py` không được import vào service mới.

## Giới hạn

- ByteTrack có thể ID-switch khi che khuất, camera rung hoặc mật độ xe cao.
- Vạch phải được hiệu chỉnh theo camera; mặc định 48% chỉ là baseline cũ.
- Chưa có traffic-light state, perspective calibration, speed estimation hay multi-camera identity.
- OCR chỉ chạy một lần tại candidate event; temporal OCR aggregation là hướng cải tiến.
- Plate validator chỉ hỗ trợ các pattern được test; format đặc biệt phải bổ sung explicit.
- Chưa benchmark accuracy/performance vì Git không có weights và test video được cấp phép.

## Chuẩn bị cho Backend và Docker

- Backend có thể tạo job, truyền input/output paths và ingest `results.json` theo `schema_version`.
- `job_id`, event UUID, nullable OCR fields và relative paths đã sẵn sàng cho persistence mapping.
- Model lifecycle không nằm trong per-frame loop, phù hợp worker process dài hạn.
- Phase 01 không thêm NestJS, PostgreSQL, Redis hay Docker theo đúng phạm vi.
