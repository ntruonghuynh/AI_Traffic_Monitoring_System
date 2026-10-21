# Traffic Violation Detection System

Dự án thử nghiệm Computer Vision phát hiện phương tiện, theo dõi chuyển động, ghi nhận candidate cắt qua vạch và nhận diện biển số. Phase 01 đã tách AI core Python modular; Phase 02 bổ sung NestJS Backend, PostgreSQL và Prisma để quản lý video/job/event/evidence.

> **Lưu ý:** Hệ thống hiện chưa đọc trạng thái đèn giao thông. Crossing event chỉ là `LINE_CROSSING_CANDIDATE`, không phải xác nhận vi phạm pháp lý. Mọi kết quả phải được người có thẩm quyền kiểm tra.

## Phase 01 — Refactor AI Core

AI service mới nằm trong [`ai-service/`](ai-service/README.md) với các khả năng:

- Reusable YOLO `VehicleDetector`, resolve target class từ label thật của model.
- Stateful ByteTrack integration qua `VehicleTracker`.
- Temporal line crossing dùng bottom-center, direction, hysteresis và duplicate prevention.
- Tách `PlateDetector`, `PlateRecognizer` và context-aware `PlateValidator`.
- Headless `VideoProcessor`, không phụ thuộc `cv2.imshow()`.
- JSON contract có schema version, job/event UUID, nullable OCR fields và relative artifact paths.
- Evidence JPEG, optional annotated video và optional CSV/SQLite compatibility.
- YAML config, environment overrides, structured logging và CLI.
- Unit tests không cần model weights.

Tài liệu kỹ thuật:

- [Audit kiến trúc cũ và quyết định refactor](docs/PHASE_01_AUDIT.md)
- [Hướng dẫn AI service](ai-service/README.md)
- [Tổng kết Phase 01](docs/PHASE_01_SUMMARY.md)

## Phase 02 — Backend + PostgreSQL

Backend mới nằm trong [`backend/`](backend/README.md):

- NestJS 12 + TypeScript, REST API `/api/v1` và Swagger `/api/docs`.
- PostgreSQL + Prisma ORM 7 với migration version control.
- Camera/video/job/event/evidence modules theo Controller → Service → Prisma.
- Multipart upload có format/size/signature validation và local storage abstraction.
- Trusted CLI import JSON AI schema `1.0`, transaction + idempotent upsert.
- `LINE_CROSSING_CANDIDATE` giữ nguyên semantics; review crossing không được gọi là kết luận vi phạm đèn đỏ.
- Health liveness/readiness, global DTO validation và error response nhất quán.

Tài liệu:

- [Kiến trúc Phase 02](docs/PHASE_02_ARCHITECTURE.md)
- [Thiết kế database](docs/PHASE_02_DATABASE.md)
- [REST API và AI import](docs/PHASE_02_API.md)
- [Tổng kết Phase 02](docs/PHASE_02_SUMMARY.md)

## Kiến trúc

```text
Input video
    |
Vehicle detection + ByteTrack
    |
Temporal line-crossing analysis
    |
LINE_CROSSING_CANDIDATE
    |
Plate detection + EasyOCR + validation
    |
results.json + evidence images + optional annotated video
```

```text
.
├── ai-service/                     # AI core mới
│   ├── configs/
│   ├── models/                    # weights local, không commit
│   ├── src/traffic_ai/
│   ├── tests/
│   └── pyproject.toml
├── backend/                        # NestJS + Prisma + local storage abstraction
│   ├── prisma/
│   ├── src/
│   └── test/
├── docs/
├── traffic_violation_detection.py  # legacy entry point, được giữ lại
├── license_plate_recognition.py     # legacy OCR pipeline
├── sort.py                          # legacy SORT demo, không dùng trong service mới
└── requirements.txt
```

## Cài đặt

Yêu cầu Python 3.10–3.12; khuyến nghị Python 3.11.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "ai-service[dev]"
```

`requirements.txt` ở repository root cài service mới và dependency cho legacy SORT demo:

```bash
python -m pip install -r requirements.txt
```

Nếu dùng GPU, cài PyTorch build phù hợp CUDA/MPS của máy. Không cò ghim cứng CUDA 11.8 cho mọi platform.

## Model weights

Không commit weights vào Git. Mặc định đặt tại:

```text
ai-service/models/yolov8m.pt
ai-service/models/license_plate_detector.pt
```

Có thể override path bằng `ai-service/configs/default.yaml`, `TRAFFIC_AI_VEHICLE_MODEL_PATH` và `TRAFFIC_AI_PLATE_MODEL_PATH`.

## Chạy AI service

```bash
python -m traffic_ai \
  --input /path/to/video.mp4 \
  --output /path/to/results
```

Tùy chọn:

```bash
python -m traffic_ai \
  --input /path/to/video.mp4 \
  --output /path/to/results \
  --device cpu \
  --annotated-video
```

Output chính là `results.json`; mỗi evidence path bên trong JSON tương đối với result directory.

## Chạy test

```bash
cd ai-service
../.venv/bin/python -m pytest
../.venv/bin/python -m pytest --cov=traffic_ai --cov-report=term-missing
```

Integration test tự skip nếu chưa cung cấp video và hai model weights. Xem lệnh opt-in trong [AI service README](ai-service/README.md#chạy-test).

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm test
npm run dev
```

Xem hướng dẫn PostgreSQL, seed và AI import đầy đủ trong [Backend README](backend/README.md).

## Kết quả minh họa

Baseline cũ với `7.mp4`, chạy bằng cấu hình cũ, ghi nhận 36 lượt bbox cắt qua vạch: 17 ô tô, 15 xe máy và 4 xe tải. Lần chạy hiện tại trên `7.mp4` ghi nhận 48 sự kiện ứng viên. Đây không phải accuracy benchmark và không phải số vi phạm đã xác minh.

## Giới hạn đã biết: độ phân giải biển số

Phép đo trên `7.mp4` dùng cấu hình hiện tại: vạch chuẩn hóa `y=0.48`, hướng `positive_to_negative`, tolerance `8 px`, confidence detector phương tiện/biển số `0.30`, IoU `0.50`, ảnh suy luận `640`; nguồn video có độ phân giải `1920×1080`. Có 48 track cắt vạch.

| Giai đoạn | Track có crop | Chiều rộng crop: trung vị | P90 | Lớn nhất |
| --- | ---: | ---: | ---: | ---: |
| Frame cắt vạch | 22/48 | 34 px | 38,6 px | 45 px |
| 30 frame kế tiếp, crop tốt nhất theo track | 25/48 | 34 px | 43,2 px | 59 px |

Không track nào có crop rộng từ 60 px trở lên ở cả hai giai đoạn. Chọn crop tốt nhất theo track chỉ tăng chiều rộng trung vị khoảng `+1 px`, nên cách này không được triển khai.

Biển số từ camera xa không có đủ điểm ảnh để OCR đọc. Vì vậy, `plate_number: null` ở đây phản ánh giới hạn của nguồn video, không phải kết luận về độ chính xác của OCR. Phép đo này không phải accuracy benchmark. Hướng cải thiện là dùng nguồn quay gần hơn hoặc độ phân giải cao hơn để biển số rộng khoảng 100 px trở lên, hoặc kiểm chứng OCR riêng bằng ảnh biển số cận cảnh có phép sử dụng.

Ghi chú cấu hình: `default.yaml` đặt `min_crop_size` dưới `vehicle_detection`, trong khi loader đọc giá trị này từ `plate_detection`; giá trị mặc định `20` vẫn đúng. Cần xử lý riêng, không thuộc thay đổi tài liệu này.

## Legacy source

Ba file root `traffic_violation_detection.py`, `license_plate_recognition.py`, `sort.py` chưa bị xóa để bảo toàn chức năng và phục vụ đối chiếu. Chúng không phải entry point khuyến nghị cho tích hợp Backend mới.

`sort.py` mang thông báo GPL-3.0 từ upstream. AI service mới không import/copy implementation này; nó dùng ByteTrack thông qua Ultralytics. Cần review license toàn bộ dependency và model trước khi phân phối thương mại.

## Bảo mật và quyền riêng tư

Ảnh/video giao thông và biển số có thể là dữ liệu cá nhân. Chỉ xử lý dữ liệu bạn có quyền sử dụng, áp dụng retention/access policy phù hợp và không commit video, database, model weights hay output thật. `.gitignore` chỉ cho phép ba screenshot README đã chọn.

## Giới hạn hiện tại

- Tracking có thể ID-switch khi che khuất hoặc mật độ giao thông cao.
- Line coordinates phải hiệu chỉnh theo camera.
- OCR chưa có temporal aggregation/retry trên nhiều frame.
- Chưa có traffic signal recognition, perspective calibration hay speed estimation.
- Phase 02 đã có NestJS/PostgreSQL foundation nhưng chưa có production authentication, Redis worker, object storage, Frontend hoặc Docker.
