# Phase 02 — Tổng kết Backend Development & Database Design

## Kết quả

Backend NestJS đã được triển khai trong `backend/`, dùng PostgreSQL + Prisma ORM 7, REST API có validation/Swagger, local storage abstraction và trusted AI result import CLI. Phase 01 Python không bị sửa.

## Thành phần đã triển khai

- Camera metadata CRUD, giữ lịch sử video khi xóa camera.
- Video multipart upload với size/type/signature validation, UUID storage key và safe deletion rule.
- Processing job `PENDING/PROCESSING/COMPLETED/FAILED` với transition validation.
- Event query/filter/pagination/stable sort và review development-only.
- Evidence metadata/content với storage boundary và internal token.
- Health liveness/readiness tách riêng.
- Prisma schema, initial SQL migration có FK/index/check constraint và safe seed.
- AI JSON DTO/validation/mapping/transaction/idempotency/rollback cleanup.
- Swagger `/api/docs`, global DTO validation, CORS và centralized error filter.

## Contract AI

- Giữ nguyên schema `1.0` của Phase 01.
- Chỉ chấp nhận `LINE_CROSSING_CANDIDATE` và AI status `PENDING_REVIEW`.
- OCR nullable được lưu đúng giá trị; không fabricate plate/confidence.
- `event_id` AI map vào `sourceEventId`; composite unique với `jobId`.
- `crossing_direction` được giữ dù không có trong danh sách field gợi ý ban đầu.
- `detectedAt` để null vì Phase 01 không cung cấp capture datetime tuyệt đối.
- Evidence relative path được resolve dưới trusted result root và copy vào backend storage.

## Kiểm tra đã chạy

Tại thời điểm tổng kết:

- `npm run db:generate`: pass, Prisma Client 7.10.0 generated.
- `npm run db:validate`: pass.
- `npm run typecheck`: pass sau khi sửa cấu hình TypeScript 6.
- `npm run lint`: pass.
- `npm test`: 8 test suites, 23 tests pass.
- `npm run test:integration`: 1 test skip do thiếu `TEST_DATABASE_URL`.
- `npm run build`: pass.
- Runtime smoke test: ứng dụng bootstrap và map toàn bộ route; `/health/live` trả `200`, `/health/ready` trả `503` với `database: down` khi cố ý dùng PostgreSQL URL không hoạt động; `/api/docs-json` trả `200`.
- PostgreSQL migration/integration test: chưa chạy vì workspace không có `psql`, `pg_isready` hoặc safe local database được cung cấp.
- `npm run test:cov`: pass, tổng line coverage `39.25%`; logic importer đạt `58–80%` theo từng file, DTO AI đạt `100%`. Chưa đặt coverage gate vì controller/integration cần PostgreSQL test database.
- Python Phase 01 được chạy lại: 27 pass, 1 real-asset integration skip do thiếu weights/video.

## Test coverage nghiệp vụ

- Camera DTO/create.
- Video metadata, MIME/extension/signature và size limit.
- Job creation, missing video và invalid transition.
- Event query filter/stable ordering.
- AI schema/version, nullable OCR, unknown fields, duplicate IDs.
- Evidence traversal.
- Idempotent upsert, missing job, transaction rollback và copied-file cleanup.

## Vấn đề và giới hạn còn lại

- Không có PostgreSQL local nên migration SQL chưa được apply thực tế; không claim integration pass.
- Jest chạy ESM dependency NestJS 12 qua Node `--experimental-vm-modules`; Node in warning đây vẫn là experimental flag.
- `npm audit --omit=dev` báo 4 high advisory trong dependency transitive của Prisma 7.10 CLI. `npm audit fix --force` sẽ downgrade Prisma 6 và phá kiến trúc Prisma 7 nên không áp dụng tự động.
- Authentication/RBAC, Redis worker, object storage, retention automation, audit history bất biến và rate limiting thuộc phase sau.
- Local storage phù hợp development/single-node, chưa phù hợp horizontal scaling.

## Files chính được tạo/thay đổi

- `backend/package.json`, config TypeScript/Nest/Jest/ESLint và `.env.example`.
- `backend/prisma/schema.prisma`, migration, seed và `prisma.config.ts`.
- Các module `cameras`, `videos`, `processing-jobs`, `detection-events`, `evidence`, `ai-results`, `health`, `storage`, `prisma`.
- Unit tests cạnh source và fixture synthetic trong `backend/test/`.
- Tài liệu Phase 02 và root README.

## Sẵn sàng cho Phase 03 — Docker

Nền tảng đã tách HTTP API, database adapter, storage và AI import. Phase 03 có thể containerize Backend/PostgreSQL/AI worker, thêm Redis queue, health probes và volumes mà không gọi YOLO từ controller. Trước khi bắt đầu cần chốt secret management, object-storage strategy, PostgreSQL test database và production auth boundary.
