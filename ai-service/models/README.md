# Model weights

Thư mục này chỉ mô tả vị trí model local. Không commit weights vào Git.

Mặc định service tìm:

```text
ai-service/models/yolov8m.pt
ai-service/models/license_plate_detector.pt
```

Có thể thay đổi bằng `configs/default.yaml` hoặc environment variables:

```bash
export TRAFFIC_AI_VEHICLE_MODEL_PATH=/path/to/yolov8m.pt
export TRAFFIC_AI_PLATE_MODEL_PATH=/path/to/license_plate_detector.pt
```

Chỉ sử dụng weights bạn có quyền truy cập và phân phối.
