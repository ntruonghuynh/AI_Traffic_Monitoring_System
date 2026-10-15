# Phase 02 — Danh mục Test Cases

Các ID trong tài liệu này là ổn định. `PASS` lịch sử thủ công không đồng nghĩa CI đã xác minh. “Không có artifact” nghĩa kết quả được cung cấp từ quan sát development nhưng workspace không có screenshot/log gốc.

## Database

### DB-001 — Kết nối PostgreSQL development

- **Module:** PostgreSQL / Prisma
- **Mục tiêu:** Xác nhận Backend kết nối được PostgreSQL development.
- **Điều kiện tiên quyết:** PostgreSQL 18.6 chạy local; database `traffic_monitoring`; port 5433; `DATABASE_URL` hợp lệ.
- **Bước thực hiện:** Khởi động PostgreSQL; chạy kiểm tra Prisma/Backend dùng development URL; quan sát kết quả kết nối.
- **Kết quả mong đợi:** Kết nối thành công, không lộ credentials.
- **Kết quả thực tế:** PostgreSQL 18.6 khởi động và kết nối development được quan sát thành công.
- **Trạng thái:** `PASS` — Manual historical.
- **Ngày thực thi:** Không được cung cấp.
- **Evidence:** Không có artifact trong workspace.
- **GitHub Issue:** Không có.

### DB-002 — Prisma Client và migration versioned

- **Module:** Prisma migration
- **Mục tiêu:** Xác nhận schema hợp lệ và migration ban đầu được áp dụng.
- **Điều kiện tiên quyết:** DB-001; Prisma CLI 7.10.0.
- **Bước thực hiện:** Generate Client; chạy `npx prisma validate`; apply migration; chạy `npx prisma migrate status`; liệt kê tables.
- **Kết quả mong đợi:** Validate thành công; migration `20261015000100_phase_02_initial` applied; schema up to date; đủ sáu tables.
- **Kết quả thực tế:** Prisma Client 7.10.0 generated; validate PASS; migration applied; status up to date; thấy `Camera`, `Video`, `ProcessingJob`, `DetectionEvent`, `EvidenceAsset`, `_prisma_migrations`.
- **Trạng thái:** `PASS` — Manual historical.
- **Ngày thực thi:** Không được cung cấp.
- **Evidence:** Không có artifact trong workspace.
- **GitHub Issue:** Không có.

### DB-003 — Kiểm tra định nghĩa ProcessingJob

- **Module:** PostgreSQL schema
- **Mục tiêu:** Xác nhận PK, FK, indexes và CHECK definitions tồn tại.
- **Điều kiện tiên quyết:** Migration đã applied.
- **Bước thực hiện:** Inspect table `ProcessingJob` bằng `psql`.
- **Kết quả mong đợi:** Các định nghĩa khớp migration.
- **Kết quả thực tế:** PK, FK, indexes và CHECK definitions được xác nhận qua `psql`; chưa thực hiện negative behavioral inserts.
- **Trạng thái:** `PASS` — Manual historical, chỉ áp dụng cho schema inspection.
- **Ngày thực thi:** Không được cung cấp.
- **Evidence:** Không có artifact trong workspace.
- **GitHub Issue:** Không có.

### DB-004 — Foreign key integrity behavior

- **Module:** PostgreSQL relations
- **Mục tiêu:** Xác minh orphan `ProcessingJob`/`DetectionEvent` bị từ chối và delete behaviors đúng thiết kế.
- **Điều kiện tiên quyết:** Dedicated test DB đã migrate.
- **Bước thực hiện:** Insert/update FK không tồn tại; thử xóa parent theo từng relation; rollback test data.
- **Kết quả mong đợi:** FK vi phạm bị từ chối; `RESTRICT`, `CASCADE`, `SET NULL` đúng migration.
- **Kết quả thực tế:** Chưa chạy behavioral test.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### DB-005 — Unique constraints behavior

- **Module:** PostgreSQL constraints
- **Mục tiêu:** Xác minh duplicate `storageKey` và `(jobId, sourceEventId)` bị chặn.
- **Điều kiện tiên quyết:** Dedicated test DB và fixtures synthetic.
- **Bước thực hiện:** Insert bản ghi hợp lệ; insert duplicate; rollback.
- **Kết quả mong đợi:** PostgreSQL từ chối duplicate, bản ghi đầu không đổi.
- **Kết quả thực tế:** Chưa chạy trên database thật.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### DB-006 — CHECK constraints behavior

- **Module:** PostgreSQL constraints
- **Mục tiêu:** Xác minh negative counts/confidence ngoài `[0,1]` và invalid EvidenceAsset parent bị từ chối.
- **Điều kiện tiên quyết:** Dedicated test DB đã migrate.
- **Bước thực hiện:** Insert/update lần lượt từng giá trị invalid và một control hợp lệ; rollback.
- **Kết quả mong đợi:** Invalid rows bị từ chối; control được chấp nhận.
- **Kết quả thực tế:** Chỉ mới xác nhận definitions; behavioral test chưa chạy.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### DB-007 — Transaction rollback trên PostgreSQL

- **Module:** Prisma transaction
- **Mục tiêu:** Xác minh lỗi giữa import không để lại job/event/evidence metadata một phần.
- **Điều kiện tiên quyết:** Dedicated test DB; fault injection an toàn.
- **Bước thực hiện:** Snapshot counts; gây lỗi trong transaction; kiểm tra counts/state sau rollback.
- **Kết quả mong đợi:** Database trở về trạng thái trước transaction.
- **Kết quả thực tế:** Chưa chạy với PostgreSQL thật; unit mock riêng nằm ở AI-IMP-008.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### DB-008 — Data persistence qua restart

- **Module:** PostgreSQL persistence
- **Mục tiêu:** Xác minh dữ liệu development/test vẫn tồn tại đúng sau restart có kiểm soát.
- **Điều kiện tiên quyết:** Môi trường test được phép restart; fixtures synthetic.
- **Bước thực hiện:** Insert fixtures; restart service DB; query lại; cleanup.
- **Kết quả mong đợi:** Dữ liệu và relations giữ nguyên.
- **Kết quả thực tế:** Chưa chạy; seed command lịch sử thành công nhưng row counts chưa được xác nhận.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

## REST API

### API-HLT-001 — Database readiness

- **Module:** Health
- **Mục tiêu:** Xác nhận readiness phân biệt database ready.
- **Điều kiện tiên quyết:** Backend và development database đang chạy.
- **Bước thực hiện:** Gọi `GET /api/v1/health/ready`.
- **Kết quả mong đợi:** HTTP 200; `ready: true`; `checks.database: up`.
- **Kết quả thực tế:** Nhận đúng HTTP 200 và payload readiness; Swagger UI cũng truy cập được tại `/api/docs`.
- **Trạng thái:** `PASS` — Manual historical.
- **Ngày thực thi:** Không được cung cấp.
- **Evidence:** Không có screenshot/log trong workspace.
- **GitHub Issue:** Không có.

### API-CAM-001 — Camera CRUD qua HTTP

- **Module:** Cameras API
- **Mục tiêu:** Xác minh create/list/get/update/delete và validation metadata.
- **Điều kiện tiên quyết:** Backend + test DB; camera payload synthetic.
- **Bước thực hiện:** Thực hiện CRUD qua Swagger/curl; thử payload thiếu fields; kiểm tra video history không cascade ngoài ý muốn.
- **Kết quả mong đợi:** Status/payload đúng contract; invalid payload bị từ chối.
- **Kết quả thực tế:** Chưa chạy qua HTTP/Swagger.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### API-CAM-002 — Camera create service và DTO

- **Module:** Cameras unit
- **Mục tiêu:** Xác minh service trim metadata và DTO từ chối thiếu `name/location`.
- **Điều kiện tiên quyết:** Jest dependencies.
- **Bước thực hiện:** Chạy `cameras.service.spec.ts` với Prisma mock và class-validator.
- **Kết quả mong đợi:** Create gọi Prisma với dữ liệu trim; validation lỗi đúng fields.
- **Kết quả thực tế:** Unit tests pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/cameras/cameras.service.spec.ts`; log tổng hợp trong `PHASE_02_TEST_LOG.md`.
- **GitHub Issue:** Không có.

### API-VID-001 — Upload video hợp lệ qua HTTP

- **Module:** Videos API
- **Mục tiêu:** Xác minh multipart upload lưu file với storage key an toàn và metadata DB.
- **Điều kiện tiên quyết:** Backend + test DB + file video synthetic được phép.
- **Bước thực hiện:** Upload; đọc record; kiểm tra storage boundary; xóa theo policy.
- **Kết quả mong đợi:** HTTP 201; filename nội bộ an toàn; không lộ path local.
- **Kết quả thực tế:** Chưa chạy upload thật.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### API-VID-002 — Từ chối định dạng/signature video không hợp lệ

- **Module:** Video validation
- **Mục tiêu:** Chặn extension, MIME hoặc signature giả.
- **Điều kiện tiên quyết:** Jest; Multer file synthetic.
- **Bước thực hiện:** Chạy unit cases cho MP4 hợp lệ, extension/MIME invalid và signature giả.
- **Kết quả mong đợi:** File hợp lệ được chấp nhận; file giả bị `BadRequestException`.
- **Kết quả thực tế:** Unit tests pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/videos/video-validation.spec.ts`.
- **GitHub Issue:** Không có.

### API-VID-003 — Upload size limit

- **Module:** Video validation
- **Mục tiêu:** Chặn file vượt `MAX_UPLOAD_SIZE`.
- **Điều kiện tiên quyết:** Jest; file synthetic có size vượt limit.
- **Bước thực hiện:** Gọi validator với limit nhỏ hơn `file.size`.
- **Kết quả mong đợi:** Ném lỗi “vượt quá”.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/videos/video-validation.spec.ts`.
- **GitHub Issue:** Không có.

### API-JOB-001 — Tạo ProcessingJob ở PENDING

- **Module:** ProcessingJobs unit
- **Mục tiêu:** Xác minh job chỉ tạo cho video tồn tại và bắt đầu `PENDING`.
- **Điều kiện tiên quyết:** Jest; Prisma mock.
- **Bước thực hiện:** Tạo với video có/không tồn tại.
- **Kết quả mong đợi:** Case hợp lệ trả `PENDING`; missing video trả NotFound.
- **Kết quả thực tế:** Unit tests pass; chưa xác minh qua HTTP/DB thật.
- **Trạng thái:** `PASS` — Local automated, phạm vi unit.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/processing-jobs/processing-jobs.service.spec.ts`.
- **GitHub Issue:** Không có.

### API-JOB-002 — Job status transitions

- **Module:** ProcessingJobs state machine
- **Mục tiêu:** Cho phép transitions hợp lệ và chặn direct/terminal transitions sai.
- **Điều kiện tiên quyết:** Jest.
- **Bước thực hiện:** Test `PENDING→PROCESSING→COMPLETED`, `PENDING→COMPLETED`, terminal mutation.
- **Kết quả mong đợi:** Valid không lỗi; invalid ném `ConflictException`.
- **Kết quả thực tế:** Ba unit tests pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/processing-jobs/job-state.spec.ts`.
- **GitHub Issue:** Không có.

### API-JOB-003 — ProcessingJob CRUD/query qua API

- **Module:** ProcessingJobs API
- **Mục tiêu:** Xác minh create/list/get/events, pagination/filter và HTTP errors trên DB thật.
- **Điều kiện tiên quyết:** Backend + test DB + video record.
- **Bước thực hiện:** Gọi endpoints qua Swagger/curl; kiểm tra response và DB.
- **Kết quả mong đợi:** REST contract và status codes đúng.
- **Kết quả thực tế:** Chưa chạy.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### API-EVT-001 — Event filter và stable sorting ở service

- **Module:** DetectionEvents unit
- **Mục tiêu:** Xác minh filters được map vào Prisma và sorting ổn định.
- **Điều kiện tiên quyết:** Jest; Prisma mock.
- **Bước thực hiện:** Query với `plateNumber`, `vehicleType`, page/limit; inspect Prisma call.
- **Kết quả mong đợi:** Transaction count/findMany và sort `createdAt`, `id` giảm dần.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/detection-events/detection-events.service.spec.ts`.
- **GitHub Issue:** Không có.

### API-EVT-002 — Event querying qua HTTP

- **Module:** DetectionEvents API
- **Mục tiêu:** Xác minh filter video/job/type/review/vehicle/plate/date/timestamp và pagination trên dữ liệu thật.
- **Điều kiện tiên quyết:** Backend + test DB có nhiều synthetic events.
- **Bước thực hiện:** Gọi các tổ hợp query; kiểm tra stable order và metadata pagination.
- **Kết quả mong đợi:** Chỉ trả rows phù hợp, không duplicate/missing giữa pages.
- **Kết quả thực tế:** Chưa chạy qua API/database.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### API-EVD-001 — Evidence authorization

- **Module:** Evidence/InternalTokenGuard
- **Mục tiêu:** Chặn thiếu/sai internal token và vô hiệu mutation/access nhạy cảm trong production theo policy.
- **Điều kiện tiên quyết:** Backend test env; token synthetic; evidence synthetic.
- **Bước thực hiện:** Gọi endpoint không token, sai token, đúng token; lặp lại với `NODE_ENV=production`.
- **Kết quả mong đợi:** 401/403 đúng trường hợp; không lộ filesystem path.
- **Kết quả thực tế:** Chưa có test guard/API thực thi.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

## AI result integration

### AI-IMP-001 — Valid JSON mapping trong unit test

- **Module:** AiResultImportService
- **Mục tiêu:** Xác minh payload schema `1.0` hợp lệ đi qua validation/mapping và transaction callback.
- **Điều kiện tiên quyết:** Jest; fixture synthetic; Prisma/storage mocks.
- **Bước thực hiện:** Import fixture hợp lệ vào service.
- **Kết quả mong đợi:** Evidence copy mock và event/job operations được gọi đúng.
- **Kết quả thực tế:** Service unit test pass; chưa ghi PostgreSQL thật.
- **Trạng thái:** `PASS` — Local automated, phạm vi mock.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result-import.service.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-002 — Invalid schema version

- **Module:** AI result validator
- **Mục tiêu:** Từ chối schema version không hỗ trợ.
- **Điều kiện tiên quyết:** Jest; fixture đổi thành `2.0`.
- **Bước thực hiện:** Gọi validator.
- **Kết quả mong đợi:** `BadRequestException`.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result.validator.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-003 — Nullable OCR

- **Module:** AI result validator
- **Mục tiêu:** Giữ `plate_number`, `plate_raw_text`, `plate_confidence` là `null` khi AI không chắc chắn.
- **Điều kiện tiên quyết:** Fixture schema `1.0` có OCR null.
- **Bước thực hiện:** Validate payload; inspect output.
- **Kết quả mong đợi:** Payload được chấp nhận và không fabricate dữ liệu.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result.validator.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-004 — Duplicate import qua upsert mock

- **Module:** AiResultImportService
- **Mục tiêu:** Xác minh repeated import dùng composite unique selector.
- **Điều kiện tiên quyết:** Jest; Prisma transaction mock.
- **Bước thực hiện:** Import cùng fixture hai lần; inspect `upsert` selector.
- **Kết quả mong đợi:** Dùng `(jobId, sourceEventId)` thay vì create mù.
- **Kết quả thực tế:** Unit test pass; không chứng minh row count trên DB thật.
- **Trạng thái:** `PASS` — Local automated, phạm vi mock.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result-import.service.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-005 — Idempotency trên PostgreSQL thật

- **Module:** AI import + PostgreSQL
- **Mục tiêu:** Xác minh import lặp không tăng số event/evidence records.
- **Điều kiện tiên quyết:** Dedicated test DB; job/video synthetic; trusted result directory.
- **Bước thực hiện:** Chạy CLI hai lần; query row counts và payload.
- **Kết quả mong đợi:** Một logical event, state nhất quán.
- **Kết quả thực tế:** Chưa chạy.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### AI-IMP-006 — Relative evidence path hợp lệ

- **Module:** AI import/storage
- **Mục tiêu:** Chấp nhận relative path an toàn và map sang backend storage key.
- **Điều kiện tiên quyết:** Fixture dùng `evidence/event.jpg`; storage mock.
- **Bước thực hiện:** Import fixture và inspect storage call/upsert.
- **Kết quả mong đợi:** Resolve dưới trusted root; không persist absolute source path.
- **Kết quả thực tế:** Unit import path pass với mock.
- **Trạng thái:** `PASS` — Local automated, phạm vi mock.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** Fixture `backend/test/fixtures/ai-result.fixture.ts` và importer spec.
- **GitHub Issue:** Không có.

### AI-IMP-007 — Path traversal rejection

- **Module:** AI result validator
- **Mục tiêu:** Từ chối `../private.jpg` và paths vượt trusted root.
- **Điều kiện tiên quyết:** Jest; malicious synthetic path.
- **Bước thực hiện:** Validate payload có traversal.
- **Kết quả mong đợi:** Validation fail trước database import.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result.validator.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-008 — Import rollback và evidence cleanup mock

- **Module:** AI import transaction
- **Mục tiêu:** Xác minh database failure được propagate và newly copied evidence được cleanup.
- **Điều kiện tiên quyết:** Jest; transaction mock ném lỗi.
- **Bước thực hiện:** Import fixture; ép transaction fail; inspect delete call.
- **Kết quả mong đợi:** Import reject và xóa đúng storage key mới copy.
- **Kết quả thực tế:** Unit test pass.
- **Trạng thái:** `PASS` — Local automated, không thay thế DB-007.
- **Ngày thực thi:** 2026-10-15.
- **Evidence:** `backend/src/ai-results/ai-result-import.service.spec.ts`.
- **GitHub Issue:** Không có.

### AI-IMP-009 — Valid import vào PostgreSQL thật

- **Module:** AI import CLI + PostgreSQL
- **Mục tiêu:** Xác minh JSON/evidence synthetic tạo job completion, events và assets atomically.
- **Điều kiện tiên quyết:** Test DB, PENDING job, trusted result directory, CLI env an toàn.
- **Bước thực hiện:** Chạy `npm run import:ai -- --job-id <UUID> --file <result.json> --result-root <dir>`; query DB/storage.
- **Kết quả mong đợi:** Mapping đúng contract; job chỉ complete sau import hợp lệ.
- **Kết quả thực tế:** Chưa chạy trên real DB.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### AI-REV-001 — Event review state validation

- **Module:** DetectionEvents review
- **Mục tiêu:** Chỉ cho phép `VERIFIED_CROSSING`/`REJECTED_CANDIDATE`, chặn `PENDING_REVIEW`, và giữ cảnh báo pháp lý.
- **Điều kiện tiên quyết:** Auth boundary test; event synthetic.
- **Bước thực hiện:** Gọi review service/API với từng state và token cases.
- **Kết quả mong đợi:** Invalid state bị 400; valid update có `reviewedAt`; không mô tả là red-light violation đã xác nhận.
- **Kết quả thực tế:** Chưa có automated/manual execution.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.

### AI-E2E-001 — End-to-end real inference đến Backend

- **Module:** Python AI → JSON/evidence → Backend/PostgreSQL
- **Mục tiêu:** Xác minh toàn pipeline bằng video và weights được cấp hợp pháp.
- **Điều kiện tiên quyết:** Real assets, test DB/storage, acceptance dataset và quyền sử dụng rõ ràng.
- **Bước thực hiện:** Chạy AI CLI; kiểm tra JSON; import Backend; query events/evidence; đánh giá bằng ground truth được duyệt.
- **Kết quả mong đợi:** Pipeline hoàn thành, output hợp schema và không fabricate plate.
- **Kết quả thực tế:** Chưa chạy. Pytest asset-gated integration hiện chỉ bị `SKIPPED` vì thiếu assets.
- **Trạng thái:** `NOT_RUN`.
- **Ngày thực thi:** Chưa có.
- **Evidence:** Chưa có.
- **GitHub Issue:** Không có.
