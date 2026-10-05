# Phát hiện vi phạm giao thông và nhận diện biển số

Dự án thử nghiệm xử lý video bằng thị giác máy tính: phát hiện phương tiện, đánh dấu trường hợp cắt qua vạch dừng được cấu hình sẵn, nhận diện biển số bằng OCR và xuất kết quả để kiểm tra.

> **Lưu ý:** Đây là công cụ hỗ trợ thử nghiệm, không phải hệ thống xử phạt tự động. Kết quả mô hình có thể sai và cần được người có thẩm quyền xác minh.

## Tính năng

- Phát hiện ô tô, xe máy, xe buýt và xe tải bằng Ultralytics YOLO.
- Phát hiện vùng biển số bằng mô hình YOLO riêng trong `models/`.
- Tiền xử lý ảnh và đọc ký tự biển số bằng EasyOCR (ngôn ngữ Anh, Việt).
- Hiển thị video có vạch kiểm tra và thông tin phát hiện.
- Ghi loại phương tiện/thời điểm vào SQLite; xuất loại phương tiện và biển số đọc được ra CSV.

## Quy trình hiện tại

`traffic_violation_detection.py` đọc video `7.mp4` từ thư mục gốc. Một phương tiện được đánh dấu khi hộp phát hiện đi qua đường ngang đặt tại 48% chiều cao khung hình. Chương trình mở cửa sổ video; nhấn `q` để dừng. Kết quả được ghi vào:

- `violators.csv`: loại phương tiện và biển số OCR (hoặc `None`).
- `violations.db`: bảng `violations` gồm `id`, `vehicle_type`, `timestamp`.
- `plates/` và `plates_detected/`: ảnh biển số đã cắt/tiền xử lý.

Đường kiểm tra hiện là hằng số hình học trong mã, không đọc trạng thái đèn giao thông. Vì vậy, việc vượt đường này không đồng nghĩa với xác nhận vi phạm luật giao thông. Tracker SORT có trong repo nhưng luồng chính hiện không gọi tracker.

## Cấu trúc chính

```text
.
├── traffic_violation_detection.py   # Chạy phát hiện trên video
├── license_plate_recognition.py     # Phát hiện biển số và OCR
├── kiemtradulieudatabase.py         # In các dòng trong violations.db
├── sort.py                          # Triển khai tracker SORT
├── requirements.txt                # Danh sách dependency hiện tại
├── yolov8m.pt                       # Cần tự cung cấp; không nằm trong Git
└── models/
    └── license_plate_detector.pt    # Cần tự cung cấp; không nằm trong Git
```

## Yêu cầu

- Python 3.10 hoặc phiên bản tương thích với các package đã ghim trong `requirements.txt`.
- GPU NVIDIA/CUDA tương thích với PyTorch CUDA 11.8; mã khởi tạo EasyOCR với `gpu=True`.
- Quyền truy cập camera/video và giao diện đồ họa để hiển thị cửa sổ OpenCV.
- Hai model weights đúng đường dẫn: `yolov8m.pt` và `models/license_plate_detector.pt`.
- Video đầu vào hợp pháp, đặt tại `7.mp4` ở thư mục gốc.

Các model weights không được quản lý trong Git. Tải/cung cấp chúng từ nguồn mà bạn có quyền sử dụng và đặt đúng đường dẫn nêu trên. Nếu đổi model biển số, kiểm tra lại định dạng đầu ra và độ chính xác của OCR.

## Cài đặt

> Các phiên bản trong `requirements.txt` là snapshot môi trường phát triển, có ghim PyTorch CUDA 11.8 và cả hai gói `opencv-python`/`opencv-python-headless`. Có thể cần điều chỉnh theo hệ điều hành, phiên bản Python và CUDA của máy.

```bash
git clone <URL-repository-cua-ban>
cd <thu-muc-repository>
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

> Trên Windows, kích hoạt môi trường bằng `.venv\Scripts\activate`. Cài PyTorch theo hướng dẫn chính thức tương ứng với CUDA của máy nếu lệnh cài requirements không tìm được wheel phù hợp. Máy Mac/CPU không chạy được cấu hình hiện tại nguyên trạng: cần cài bản PyTorch phù hợp và đổi `gpu=True` trong `license_plate_recognition.py` sang cấu hình OCR phù hợp trước khi chạy.

## Chạy

1. Đặt video thử nghiệm của bạn ở thư mục gốc và đặt tên `7.mp4`.
2. Kiểm tra hai model weights đã có đúng vị trí.
3. Chạy:

```bash
python traffic_violation_detection.py
```

4. Nhấn `q` trên cửa sổ video để kết thúc. CSV và ảnh kết quả được ghi trong thư mục dự án.
5. Để xem dữ liệu SQLite đã lưu:

```bash
python kiemtradulieudatabase.py
```

Mỗi lần chạy ghi thêm vào `violations.db`, còn `violators.csv` được ghi đè. Sao lưu hoặc đổi tên kết quả cần giữ trước khi chạy lại.

## Bảo mật và quyền riêng tư

Ảnh/video giao thông và biển số xe có thể là dữ liệu cá nhân. Chỉ dùng dữ liệu bạn có quyền xử lý; thông báo và xin phép khi pháp luật yêu cầu; không commit video thật, ảnh biển số, database hay kết quả nhận diện lên repo công khai. Các thư mục dữ liệu/kết quả và video `7.mp4` được bỏ qua bởi `.gitignore`.

## GitHub

- Quy trình đóng góp và quy tắc nhánh: [CONTRIBUTING.md](CONTRIBUTING.md).
- Báo cáo lỗ hổng bảo mật: [SECURITY.md](SECURITY.md).
- Mẫu issue và pull request: `.github/ISSUE_TEMPLATE/` và `.github/PULL_REQUEST_TEMPLATE.md`.
- Repo hiện chưa khai báo giấy phép tổng thể. `sort.py` có thông báo mã nguồn GPL-3.0; hãy xác minh quyền và nghĩa vụ phân phối của toàn bộ mã/model trước khi chọn giấy phép hoặc public repo. Không mặc định phần còn lại được cấp phép theo GPL.

## Giới hạn

- Vạch kiểm tra được cố định theo tỷ lệ khung hình, không hiệu chỉnh phối cảnh hay theo từng camera.
- Logic hiện tại không xác thực đèn đỏ, tín hiệu giao thông, tốc độ hoặc danh tính người điều khiển.
- Độ chính xác phụ thuộc chất lượng video, góc quay, ánh sáng, model biển số và cấu hình phần cứng.
- Cần kiểm tra thủ công mọi kết quả; không dùng làm bằng chứng xử phạt nếu chưa được kiểm định và phê duyệt phù hợp.