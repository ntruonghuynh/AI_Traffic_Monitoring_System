# Hệ thống quản lý kiểm thử

Thư mục này là nguồn tham chiếu cho kế hoạch, test case, lịch sử thực thi và evidence của `Traffic_violate_detection`. Test Case ID phải được giữ ổn định; nếu một case không còn áp dụng, giữ ID và ghi lý do thay vì tái sử dụng cho mục tiêu khác.

## Cấu trúc

- `PHASE_01_TEST_REPORT.md`: báo cáo Pytest của Python AI service.
- `PHASE_02_TEST_PLAN.md`: phạm vi, chiến lược, môi trường và tiêu chí Phase 02.
- `PHASE_02_TEST_CASES.md`: danh mục test case có thể truy vết.
- `PHASE_02_TEST_LOG.md`: lịch sử thủ công và lần chạy tự động, được tách riêng.
- `evidence/README.md`: quy tắc lưu evidence không chứa dữ liệu nhạy cảm.

## Trạng thái chuẩn

| Trạng thái | Ý nghĩa |
|---|---|
| `PASS` | Đã thực thi và kết quả đúng kỳ vọng. |
| `FAIL` | Đã thực thi và có ít nhất một kết quả sai kỳ vọng. |
| `BLOCKED` | Không thể thực thi do blocker đã xác định. |
| `NOT_RUN` | Chưa thực thi. |
| `SKIPPED` | Test runner đã chủ động bỏ qua theo điều kiện được khai báo. |

Không suy ra `PASS` từ việc source code, migration hoặc constraint tồn tại. Test hành vi database chỉ `PASS` sau khi thao tác tương ứng thực sự chạy trên database test cô lập.

## Quy ước kết quả

Kết quả lịch sử do người phát triển quan sát được gắn nguồn **Manual historical** và không được mô tả như kết quả CI. Kết quả chạy lại tại workspace được gắn nguồn **Local automated**. Workflow mới chỉ có trạng thái `NOT_RUN` cho đến khi GitHub Actions tạo một run thực tế.

Mỗi test case phải có: ID, module, mục tiêu, điều kiện tiên quyết, bước chạy, kết quả mong đợi, kết quả thực tế, trạng thái, ngày chạy khi biết, evidence và GitHub Issue liên quan.

## Quy trình defect

1. Ghi `FAIL` trong test log và liên kết Test Case ID.
2. Tạo issue bằng `bug_report.yml`; không đưa secrets hoặc dữ liệu cá nhân vào issue.
3. Liên kết issue ngược lại test case/test log.
4. Sau khi sửa, chạy regression và thêm một log entry mới; không ghi đè kết quả cũ.

Không có GitHub Issue nào được tạo tự động trong lần thiết lập này.
