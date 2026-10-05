# Quy định đóng góp

Cảm ơn bạn đã quan tâm đóng góp cho dự án. Các đề xuất cần hướng tới mục đích thử nghiệm/nghiên cứu và tôn trọng quyền riêng tư.

## Trước khi tạo thay đổi

- Mở issue để mô tả lỗi hoặc đề xuất lớn; tránh tạo nhiều issue trùng lặp.
- Không gửi video giám sát thật, ảnh biển số, dữ liệu cá nhân, database, kết quả chạy hoặc model không rõ quyền phân phối.
- Giữ thay đổi tập trung; không đưa khóa, token, mật khẩu hay thông tin cá nhân vào mã nguồn/lịch sử Git.

## Nhánh và pull request

- Tạo nhánh từ `main`, đặt tên ngắn gọn, ví dụ `fix/ocr-format` hoặc `docs/setup`.
- Mỗi pull request nên giải quyết một mục tiêu, mô tả lý do, thay đổi và cách kiểm tra.
- Ghi rõ các thay đổi về môi trường, model, dữ liệu hoặc hành vi nhận diện.
- Không tuyên bố độ chính xác hoặc khả năng xác định vi phạm nếu chưa có đánh giá tái lập được.
- Chờ maintainer xem xét trước khi merge; không đẩy trực tiếp lên nhánh mặc định nếu repository bật bảo vệ nhánh.

## Kiểm tra trước khi gửi

- Chạy `python -m compileall traffic_violation_detection.py license_plate_recognition.py kiemtradulieudatabase.py sort.py`.
- Kiểm tra diff, xác nhận không có dữ liệu đầu vào/đầu ra hoặc secret bị thêm vào.
- Nếu thay đổi thuật toán, mô tả dữ liệu kiểm thử đã được phép sử dụng và giới hạn còn lại. Không đưa dữ liệu nhận dạng cá nhân vào pull request.

## Giấy phép

Chỉ đóng góp nội dung bạn có quyền chia sẻ. Repository chưa xác lập giấy phép tổng thể; `sort.py` có thông báo GPL-3.0. Trao đổi với maintainer về giấy phép trước khi đóng góp nội dung có nguồn gốc bên ngoài.