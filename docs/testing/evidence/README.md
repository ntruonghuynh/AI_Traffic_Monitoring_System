# Quy tắc evidence kiểm thử

Workspace hiện không có screenshot/log thủ công tương ứng với các quan sát PostgreSQL/Swagger đã báo cáo. Không tạo evidence thay thế. Có thể bổ sung evidence sau theo quy trình dưới đây.

## Tên file

Dùng định dạng:

```text
YYYY-MM-DD_<TEST-CASE-ID>_<short-description>.<ext>
```

Ví dụ synthetic: `2026-10-15_API-HLT-001_health-ready.json`.

## Nội dung được phép

- Screenshot UI/Swagger đã che secrets và dữ liệu cá nhân.
- Log command đã loại bỏ password, token, absolute private path và connection string nhạy cảm.
- JSON/XML test report synthetic.
- Link đến GitHub Actions run/artifact hoặc GitHub Issue.

Không lưu database password, internal token, `.env`, video/frame riêng tư hoặc biển số thật. Không chỉnh sửa evidence để làm thay đổi ý nghĩa kết quả; nếu cần che dữ liệu, ghi rõ phần đã redacted.

## Cách bổ sung

1. Xác nhận Test Case ID và ngày thực thi thật.
2. Redact dữ liệu nhạy cảm, giữ command/status/error cần thiết.
3. Đặt file trong thư mục này hoặc dùng GitHub Actions artifact có retention rõ ràng.
4. Thêm đường dẫn vào `PHASE_02_TEST_LOG.md` và test case tương ứng.
5. Nếu có defect, thêm liên kết Issue nhưng không ghi đè log cũ.

Các test reports được CI tạo dưới `backend/coverage`, `backend/test-results` và `ai-service/test-results` là generated artifacts, đã bị Git ignore và không commit vào source.
