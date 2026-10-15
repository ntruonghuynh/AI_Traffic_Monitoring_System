# Phase 02 — Test Execution Log

Tài liệu này append kết quả theo nguồn. Lịch sử thủ công không được chuyển thành CI result; các workflow mới vẫn `NOT_RUN` cho đến khi có GitHub Actions run.

## A. Manual historical — quan sát trong quá trình development

**Ngày thực thi:** Không được cung cấp.  
**Evidence:** Workspace không có screenshot/log gốc; không tạo evidence giả.

| Hạng mục | Kết quả quan sát | Trạng thái | Test Case |
|---|---|---|---|
| PostgreSQL service | PostgreSQL 18.6 khởi động thành công | `PASS` | DB-001 |
| Development DB | `traffic_monitoring` trên local port 5433 kết nối được | `PASS` | DB-001 |
| Prisma Client | Prisma Client 7.10.0 generated | `PASS` | DB-002 |
| Prisma validate | `npx prisma validate` hoàn tất thành công | `PASS` | DB-002 |
| Migration | `20261015000100_phase_02_initial` applied | `PASS` | DB-002 |
| Migration status | Database schema up to date | `PASS` | DB-002 |
| Tables | Xác nhận sáu tables: `Camera`, `Video`, `ProcessingJob`, `DetectionEvent`, `EvidenceAsset`, `_prisma_migrations` | `PASS` | DB-002 |
| ProcessingJob definitions | PK, FK, indexes và CHECK definitions được xác nhận bằng `psql`; chưa test hành vi invalid insert/update | `PASS` cho inspection | DB-003 |
| Seed | Prisma seed command chạy thành công; row counts chưa được xác nhận | `PASS` cho command, không kết luận persistence | DB-008 vẫn `NOT_RUN` |
| Swagger | UI truy cập được tại `http://localhost:3000/api/docs` | `PASS` | API-HLT-001 |
| Readiness | `GET /api/v1/health/ready` trả HTTP 200, `ready: true`, `checks.database: up` | `PASS` | API-HLT-001 |

## B. Local automated — lần chạy mới 2026-10-15

### Backend unit tests và coverage

- **Lệnh:** `cd backend && npm run test:cov -- --json --outputFile=coverage/jest-results.json`
- **Kết quả:** 8/8 suites passed; 23/23 tests passed; 0 snapshots.
- **Coverage:** statements 38.33%, branches 36.60%, functions 35.04%, lines 39.25%.
- **Trạng thái:** `PASS`.
- **Evidence:** Terminal output; `backend/coverage/` là generated/ignored directory.

Các case unit được trace trong `PHASE_02_TEST_CASES.md`: API-CAM-002, API-VID-002, API-VID-003, API-JOB-001, API-JOB-002, API-EVT-001 và AI-IMP-001 đến AI-IMP-004, AI-IMP-006 đến AI-IMP-008.

### Static/build/Prisma checks

| Lệnh | Kết quả | Trạng thái |
|---|---|---|
| `npm run lint` | Exit code 0 | `PASS` |
| `npm run typecheck` | Exit code 0 | `PASS` |
| `npm run build` | Prisma Client 7.10.0 generated; Nest build exit code 0 | `PASS` |
| `npm run db:validate` | `prisma/schema.prisma` valid | `PASS` |

Build/validate dùng một placeholder URL chỉ để parse/generate; không kết nối database và không phải database integration result.

### PostgreSQL integration harness local

- **Lệnh:** `env -u TEST_DATABASE_URL npm run test:integration`
- **Kết quả:** 1 suite skipped, 1 test skipped vì không cấp dedicated test database.
- **Trạng thái runner:** `SKIPPED`.
- **Kết luận nghiệp vụ:** PostgreSQL integration bằng test DB riêng vẫn `NOT_RUN`; không ghi nhận `PASS`.

### Python AI regression

- **Lệnh:** `cd ai-service && ../.venv/bin/python -m pytest --cov=traffic_ai --cov-report=term-missing --cov-report=xml:test-results/coverage.xml --junitxml=test-results/pytest.xml`
- **Kết quả:** 27 passed, 1 skipped; total coverage 84%.
- **Trạng thái unit/regression:** `PASS`.
- **Real inference:** pytest integration `SKIPPED`; mục tiêu E2E vẫn `NOT_RUN` vì không có video/model paths.
- **Chi tiết:** `PHASE_01_TEST_REPORT.md`.

### YAML validation

- **Phạm vi:** Ba workflow, hai Issue Forms và `config.yml`.
- **Cách kiểm tra:** Parse YAML bằng PyYAML; kiểm tra top-level `name/body`, body là list, Issue Form IDs không trùng, `blank_issues_enabled` là boolean false.
- **Kết quả:** `YAML syntax OK: 3 workflows, 2 issue forms, 1 config`.
- **Trạng thái:** `PASS` cho syntax/structural checks.
- **Giới hạn:** `actionlint` không có trong workspace; workflow chưa được GitHub runner thực thi.

## C. CI workflows mới

| Workflow | Chức năng | Trạng thái |
|---|---|---|
| `backend-ci.yml` | npm ci, Prisma generate, lint, typecheck, build, unit coverage artifact | `NOT_RUN` |
| `python-ai-ci.yml` | Python 3.11 CPU, install package/dev deps, pytest + JUnit/Coverage artifacts | `NOT_RUN` |
| `postgres-integration.yml` | PostgreSQL 18 isolated service, migrate deploy, integration JSON artifact | `NOT_RUN` |

`postgres-integration.yml` hiện chứng minh migration deploy và test kết nối hiện có. DB-004 đến DB-008 vẫn cần test behavior/persistence chuyên biệt.

## D. Pending/NOT_RUN

- Camera CRUD qua Swagger/API: API-CAM-001.
- Video upload thật: API-VID-001.
- ProcessingJob CRUD/query qua API: API-JOB-003.
- DetectionEvent querying qua API/database: API-EVT-002.
- Evidence/internal authorization: API-EVD-001.
- Foreign key, unique, CHECK, rollback và persistence behavior: DB-004 đến DB-008.
- Valid AI import và idempotency trên PostgreSQL thật: AI-IMP-009, AI-IMP-005.
- Event review state/authorization: AI-REV-001.
- End-to-end real AI inference: AI-E2E-001.

Không có `FAIL` hay `BLOCKED` được quan sát trong lần thiết lập này; các mục thiếu môi trường/asset được giữ đúng là `NOT_RUN` hoặc runner-level `SKIPPED` như mô tả trên.
