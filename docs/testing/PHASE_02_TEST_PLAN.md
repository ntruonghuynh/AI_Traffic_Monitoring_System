# Phase 02 — Kế hoạch kiểm thử Backend và Database

## 1. Mục tiêu

Xác minh Backend NestJS, Prisma/PostgreSQL, REST API, local storage boundary và AI result importer hoạt động đúng contract Phase 01, không làm sai lệch `LINE_CROSSING_CANDIDATE` thành vi phạm pháp lý đã xác nhận.

## 2. Phạm vi

Trong phạm vi:

- DTO validation, error mapping và business rules.
- Camera, Video, ProcessingJob, DetectionEvent và EvidenceAsset.
- PostgreSQL migration, FK/unique/CHECK, transaction và persistence.
- Upload validation, internal evidence/review authorization.
- AI JSON schema `1.0`, nullable OCR, idempotency và safe evidence path.
- Lint, typecheck, build, unit test, coverage và PostgreSQL integration CI.

Ngoài phạm vi hiện tại:

- Frontend, Redis worker, Docker, RTSP, production authentication/RBAC.
- Accuracy/performance benchmark của YOLO/OCR/tracking.
- Real inference nếu không có assets hợp pháp và model weights local.
- Load, soak, penetration và disaster-recovery testing.

## 3. Cấp độ và phương pháp

| Cấp độ | Mục đích | Công cụ/môi trường |
|---|---|---|
| Unit | Rule/validator/service với dependency mock | Jest |
| Static | Type, lint, build và Prisma schema | TypeScript, ESLint, Nest CLI, Prisma CLI |
| Database integration | Migration và truy vấn trên DB test cô lập | Jest + PostgreSQL 18 service |
| API integration/manual | HTTP status, payload, pagination và upload | Swagger/curl trên development/test |
| Cross-phase | Import JSON/evidence thật từ Python sang PostgreSQL | AI output synthetic trước; asset thật khi được cấp |

## 4. Môi trường

- Backend yêu cầu Node.js `>=22.18.0`; CI dùng Node.js 24.
- Python AI hỗ trợ 3.10–3.12; CI dùng Python 3.11 trên CPU.
- PostgreSQL integration CI dùng container `postgres:18`, database riêng `traffic_monitoring_test` và credentials dùng một lần trong runner.
- Local historical environment dùng PostgreSQL 18.6, database `traffic_monitoring`, port 5433. Thông tin này chỉ mô tả lịch sử development, không được workflow sử dụng.
- Không chạy migration/cleanup vào URL không rõ nguồn gốc. Test integration hiện kiểm tra tên database có hậu tố `_test`.

## 5. Dữ liệu test

- Dùng UUID synthetic, camera metadata giả lập và plate fields `null` hoặc dữ liệu giả rõ ràng.
- Không dùng video riêng tư, frame có người/biển số thật, credentials hoặc token thật.
- Evidence phải là relative path nằm dưới trusted result root và được copy vào storage boundary.

## 6. Entry criteria

- Dependency lockfile có sẵn; Prisma Client generate được.
- Test database cô lập có URL kết thúc `_test` cho integration.
- Migration versioned tồn tại và không dùng `db push`.
- Nếu test real inference, người thực thi cung cấp rõ ràng video/weights hợp pháp.

## 7. Exit criteria

- Lint, typecheck, build và unit test bắt buộc `PASS`.
- Migration deploy và integration suite `PASS` trên DB CI cô lập trước khi coi database integration hoàn tất.
- Không có defect Critical/High đang mở trong phạm vi release.
- Test `NOT_RUN`, `BLOCKED` hoặc `SKIPPED` được nêu rõ cùng lý do; không chuyển thành `PASS` theo suy đoán.
- Evidence truy vết được và đã loại bỏ dữ liệu nhạy cảm.

## 8. Rủi ro ưu tiên

| Rủi ro | Mức | Biện pháp test |
|---|---|---|
| Duplicate AI import tạo event trùng | High | Unit upsert + real DB idempotency |
| Path traversal đọc/copy file ngoài boundary | High | Validator và integration với path độc hại |
| Invalid job transition làm sai trạng thái | High | Transition matrix unit/API tests |
| Partial import làm lệch job/event/evidence | High | Transaction rollback + cleanup test |
| Upload giả MIME/extension hoặc quá lớn | High | Metadata, signature và size tests |
| Endpoint review/evidence bị truy cập ngoài ý muốn | High | Guard tests và production-deny tests |
| Constraint chỉ tồn tại nhưng chưa được kiểm chứng | Medium | Insert/update negative tests trên DB test |
| Coverage thấp ở controller/storage/guard | Medium | Bổ sung controller/integration tests theo risk |

## 9. Traceability

Test Case ID nằm trong `PHASE_02_TEST_CASES.md`; mỗi lần chạy được append vào `PHASE_02_TEST_LOG.md`. Defect dùng Issue Form “Báo lỗi”; test cycle dùng “Theo dõi kiểm thử”. Evidence dùng quy tắc trong `evidence/README.md` hoặc GitHub Actions artifact.

## 10. Quality gates CI

- `Backend CI`: `npm ci`, Prisma generate, lint, typecheck, build, unit test + coverage.
- `Python AI CI`: cài test dependencies, pytest + coverage; không cấp model paths nên không tải/chạy model thật.
- `PostgreSQL Integration CI`: service DB riêng, `prisma migrate deploy`, integration tests và artifact.

Các step bắt buộc không dùng `continue-on-error` hoặc `|| true`; lỗi sẽ làm job thất bại. Upload artifact dùng `if: always()` chỉ để giữ báo cáo và không thay đổi kết quả step test.
