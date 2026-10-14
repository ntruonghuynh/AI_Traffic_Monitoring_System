# Phase 01 — Audit AI Core

## Phạm vi audit

Audit được thực hiện trên nhánh `feature/phase-01-ai-refactor` tại commit nền `d7619db`. Repository hiện chỉ chứa source Python, tài liệu và ba ảnh minh họa; video, model weights, database và output sinh ra được loại trừ bằng `.gitignore`.

## Kiến trúc hiện tại

```text
traffic_violation_detection.py
    ├── khởi tạo YOLO vehicle model khi import
    ├── mở SQLite khi import
    ├── đọc video + detect vehicle + kiểm tra vạch
    ├── gọi license_plate_recognition.py
    ├── vẽ overlay + cv2.imshow
    └── ghi SQLite + CSV

license_plate_recognition.py
    ├── khởi tạo YOLO plate model khi import
    ├── khởi tạo EasyOCR gpu=True khi import
    ├── detect plate trong vehicle ROI
    └── preprocess + OCR + format plate

sort.py
    └── bản SORT demo độc lập, không được pipeline chính sử dụng
```

### Entry points

- `traffic_violation_detection.py`: entry point xử lý video, hardcode `7.mp4`.
- `kiemtradulieudatabase.py`: script in toàn bộ bảng `violations`.
- `sort.py`: CLI demo của SORT cho MOT benchmark, không tích hợp với video pipeline.

## Pipeline xử lý hiện tại

1. Load `yolov8m.pt` và `models/license_plate_detector.pt` từ đường dẫn tương đối thư mục chạy.
2. Khởi tạo EasyOCR cho `en`, `vi` với `gpu=True`.
3. Mở `7.mp4`, đặt vạch ngang tại `48%` chiều cao frame.
4. Chạy `vehicle_model(frame, conf=0.3)` trên từng frame.
5. Lọc cứng COCO class ID `2, 3, 5, 7` thành Car, Motorcycle, Bus, Truck.
6. Xem vehicle là vi phạm khi `y1 < line_y < center_y` trong một frame.
7. Detect plate trong vehicle crop, preprocess, OCR, lưu plate image.
8. Vẽ overlay, hiển thị bằng `cv2.imshow()`.
9. Append SQLite và ghi đè `violators.csv` khi kết thúc.

## Phát hiện phương tiện

- YOLO được load một lần ở module scope, không load mỗi frame.
- Confidence vehicle được hardcode `0.3`.
- Class IDs được giả định là COCO, không kiểm tra `model.names`.
- Kết quả không được chuyển sang data contract; logic downstream thao tác trực tiếp tensor của Ultralytics.
- Detector chứa lẫn display, OCR, business rule và persistence trong cùng vòng lặp.

## Tracking

- Pipeline gọi `model(...)`, không gọi `model.track(...)`; vì vậy `box.id` thông thường là `None`.
- Khi `track_id=None`, code thêm toạ độ bbox vào `violators`, nhưng không kiểm tra bbox tuple này trước lần sau. Cùng một xe có thể tạo nhiều record.
- Kiểm tra `if track_id` cũng xử lý sai track ID `0`.
- `sort.py` là implementation SORT GPL-3.0, phụ thuộc `filterpy`, `lap`, `matplotlib`, `scikit-image`; nó chỉ đọc MOT detections và không bảo toàn class/confidence khi tích hợp trực tiếp.

**Quyết định:** dùng ByteTrack thông qua API tracking của Ultralytics trong service mới. Lý do: phù hợp trực tiếp với YOLO result, duy trì state qua frame với `persist=True`, giữ class/confidence, giảm dependency và không sao chép thêm mã GPL vào package. `sort.py` vẫn được giữ nguyên để bảo toàn chức năng cũ.

## Logic crossing/violation hiện tại

- Logic chỉ kiểm tra bbox giao với vạch trong một frame; không so sánh vị trí trước/sau.
- Reference point hiện là center-Y kết hợp top-Y, không phải một điểm hình học nhất quán.
- Không có direction, tolerance/hysteresis, state expiry hoặc duplicate prevention đúng nghĩa.
- Text overlay gọi trực tiếp là `Vuot den do!` dù source không có trạng thái đèn giao thông.

**Quyết định business:** event mới phải là `LINE_CROSSING_CANDIDATE`, status `PENDING_REVIEW`; không khẳng định vi phạm đèn đỏ.

## License plate detection và OCR

- Plate model load một lần nhưng có side effect ngay khi import.
- Detector chỉ trả plate đầu tiên, bỏ confidence và class metadata.
- Không validate crop rỗng/out-of-bounds.
- OCR reader load ngay khi import và ép `gpu=True`, làm hỏng môi trường CPU/macOS.
- `detail=0` làm mất confidence thật, sau đó code gán giả `1.0` cho kết quả hợp lệ.
- `format_license()` thay mọi `A/G/I/J/O/S` thành số ở mọi vị trí, kể cả vị trí bắt buộc là chữ cái.
- Regex dùng `re.match` không anchor cuối chuỗi và chưa bao phủ dạng series như `59A1`.
- OCR chạy mỗi lần bbox chạm vạch, gây lặp và tốn chi phí.

## Storage và output

- SQLite connection/cursor là global mutable state; không close tại pipeline.
- Schema SQLite chỉ có `vehicle_type`, `timestamp`, không có event ID, track ID, frame, confidence, evidence path hoặc review status.
- CSV là list hai cột không có schema version và ghi đè sau mỗi run.
- Không có JSON contract cho Backend.
- `cv2.imshow()` là bắt buộc, nên không chạy headless.
- Không check `VideoCapture.isOpened()`, metadata/fps, write failure hay resource cleanup khi exception.
- Ảnh plate được ghi/đọc lại từ disk chỉ để overlay, tạo I/O không cần thiết.

## Model paths và configuration

- Vehicle weights: hardcode `yolov8m.pt`.
- Plate weights: hardcode `./models/license_plate_detector.pt`.
- Video: hardcode `7.mp4`.
- Vạch, confidence, class IDs, OCR languages, device và output paths đều hardcode.
- Path phụ thuộc current working directory thay vì config root ổn định.

## Dependencies và Python compatibility

- `requirements.txt` có 101 dependency, bao gồm nhiều package không được source dùng: Flask/FastAPI/Twilio/labelImg/PyQt5/pandas/seaborn...
- Ghim đồng thời `opencv-python` và `opencv-python-headless` có thể gây xung đột binary.
- `torch==2.6.0+cu118` và torchvision/torchaudio CUDA wheels không cài được từ PyPI mặc định trên macOS/CPU.
- Runtime local có Python system 3.9 và `.venv` Python 3.11. Service mới chọn Python `>=3.10,<3.13` để phù hợp type syntax và ecosystem CV hiện tại.
- Package mới chỉ khai báo dependency thực sự dùng; PyTorch accelerator build được cài theo platform trước khi cài service.

## Thành phần cần giữ

- Hai YOLO model và threshold ban đầu là baseline cấu hình.
- Vehicle class intent: car, motorcycle, bus, truck.
- Plate preprocessing (grayscale, bilateral filter, histogram equalization, adaptive threshold, morphology/sharpening) là một profile OCR có thể tái sử dụng.
- Output evidence image và khả năng annotated video.
- SQLite/CSV chỉ ở chế độ compatibility tùy chọn.
- Source cũ được giữ nguyên cho tới khi service mới được validate với weights/video thật.

## Thành phần cần refactor

- Tách model adapters, tracking, geometry, crossing rule, OCR, serialization và storage.
- Chuyển global state thành object có lifecycle rõ ràng và cho phép dependency injection.
- Thêm temporal state + hysteresis + direction + duplicate prevention.
- Thêm typed schemas, schema version, unique event/job IDs và relative artifact paths.
- Thêm CLI headless, YAML config và environment override.
- Viết unit tests không cần model weights.

## Kiến trúc mục tiêu

```text
CLI/config
   |
VideoProcessor
   |-- VehicleDetector --> Ultralytics YOLO
   |-- VehicleTracker  --> Ultralytics ByteTrack (temporal state)
   |-- LineCrossingDetector --> geometry + event state
   |-- PlateDetector   --> plate YOLO, chỉ tại candidate event
   |-- PlateRecognizer --> EasyOCR reader tái sử dụng
   |-- PlateValidator  --> normalize/validate theo vị trí
   |-- Visualizer      --> evidence/annotated frame
   `-- ResultWriter    --> results.json + optional CSV/SQLite
```

Detector/tracker không ghi file hay áp business rule. Crossing detector không biết YOLO/OCR. Writer không chạy inference. `VideoProcessor` là composition root duy nhất điều phối các thành phần.

## Rủi ro tương thích và quyết định kỹ thuật

1. **Ultralytics API:** result/tensor shape và tracker config có thể thay đổi giữa minor versions. Adapter cô lập parsing và package giới hạn `ultralytics>=8.3,<9`.
2. **ByteTrack ID switch:** occlusion, camera motion và crowded scenes có thể đổi ID. Event là candidate, dedupe chỉ theo track trong một job; chưa tuyên bố reliability.
3. **CPU/GPU:** `device=auto/cpu/cuda/mps` là config. `auto` không ép CUDA; OCR nhận boolean GPU phù hợp khả năng thực tế.
4. **Model labels:** class names được resolve từ `model.names`; class name không tồn tại bị báo lỗi thay vì âm thầm dùng COCO ID.
5. **Line coordinates:** YAML dùng normalized coordinates để đổi video resolution; processor chuyển sang pixel khi đọc metadata.
6. **OCR:** không gán confidence giả, không fabricate plate. Chuỗi không đủ ngưỡng/pattern trả `null` và vẫn giữ raw text.
7. **Legacy behavior:** service mới headless mặc định, event semantics thay từ “vi phạm đèn đỏ” sang “candidate crossing”, OCR chỉ chạy tại event. Source cũ không bị xóa.
8. **Privacy:** evidence có thể chứa biển số/người; output tiếp tục bị ignore và cần policy retention/access ở Phase sau.
9. **Integration:** JSON dùng schema version và relative paths; Backend có thể ingest mà không phụ thuộc Python object hoặc local absolute path.

