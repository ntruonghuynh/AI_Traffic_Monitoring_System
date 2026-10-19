# Phase 02 — Thiết kế PostgreSQL và Prisma

## Công nghệ và version

- PostgreSQL 16+; hướng dẫn local dùng PostgreSQL 18 qua Homebrew.
- Prisma ORM/Client `7.10.x`.
- Generator `prisma-client` xuất TypeScript vào `backend/src/generated/prisma`.
- Kết nối runtime qua `@prisma/adapter-pg`; URL migration nằm trong `prisma.config.ts`.

Generated client không commit. Chạy `npm run db:generate` sau khi clone hoặc thay schema.

## Quan hệ và delete behavior

- `Camera 0..1 -> N Video`: `ON DELETE SET NULL`, vì xóa metadata camera không được xóa video lịch sử.
- `Video 1 -> N ProcessingJob`: `ON DELETE RESTRICT`. API cũng từ chối xóa video nếu đã có job.
- `ProcessingJob 1 -> N DetectionEvent`: `ON DELETE CASCADE`; Phase 02 không mở API xóa job.
- `DetectionEvent/ProcessingJob -> EvidenceAsset`: evidence thuộc đúng một parent. SQL migration có XOR `CHECK`.

## Entity chính

### Camera

Lưu tên, vị trí, mô tả, `sourceType`, `status` và `configuration` JSON nullable. `configuration` dành cho line/zone metadata về sau; tuyệt đối không lưu RTSP credentials ở đây.

### Video

Lưu metadata và portable `storageKey`; binary nằm dưới `STORAGE_ROOT`. `fileSize` dùng `BIGINT`, API serialize thành string để không mất độ chính xác JavaScript.

### ProcessingJob

Transition hợp lệ:

```text
PENDING -> PROCESSING -> COMPLETED
   |             |
   `-----------> FAILED
```

`COMPLETED` và `FAILED` là terminal state trong Phase 02. Import một payload `COMPLETED` cho job `PENDING` thực hiện bước `PROCESSING` bên trong cùng transaction rồi mới cập nhật `COMPLETED`.

### DetectionEvent

- `id`: UUID nội bộ.
- `sourceEventId`: UUID từ AI.
- unique `(jobId, sourceEventId)` chống duplicate import.
- `trackId` chỉ có ý nghĩa trong một job, không unique toàn hệ thống.
- `reviewStatus`: `PENDING_REVIEW`, `VERIFIED_CROSSING`, `REJECTED_CANDIDATE`.
- `VERIFIED_CROSSING` chỉ xác nhận crossing, không phải xác nhận vi phạm đèn đỏ.
- `rawPayload`: JSON event nguyên bản phục vụ trace/audit.
- OCR fields nullable; không suy diễn plate hoặc confidence.

### EvidenceAsset

Chỉ lưu metadata và `storageKey`. Evidence toàn cảnh của event là `IMAGE`; ảnh crop biển số là `PLATE_CROP`; annotated video là artifact cấp job. Migration thêm `PLATE_CROP` vào enum `EvidenceAssetType`. SQL migration bảo đảm mỗi asset không thể đồng thời thuộc job và event.

## Index và constraint

- Composite index status/time cho danh sách job/event.
- Index `cameraId`, `videoId`, `jobId`, plate, vehicle type và timestamp.
- Unique storage key và source event theo job.
- SQL `CHECK` cho size/dimension, counters, confidence `[0,1]`, frame/timestamp không âm và evidence parent XOR.

Prisma schema chưa biểu diễn `CHECK`; các constraint bổ sung nằm trong migration SQL và không được thay bằng `prisma db push`.

## Migration

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

Production/staging dùng migration đã version control:

```bash
npm run db:migrate:deploy
```

Không chạy migration/cleanup trên database chưa xác định rõ. Seed chỉ tạo một camera metadata giả lập, không có video, biển số hoặc credentials thật.

## PostgreSQL local trên macOS

```bash
brew install postgresql@18
brew services start postgresql@18
createuser --pwprompt traffic_app
createdb --owner=traffic_app traffic_monitoring
```

Sau đó sửa `DATABASE_URL` trong `.env`. Nếu binary versioned chưa nằm trong `PATH`, làm theo dòng `brew info postgresql@18` của máy hoặc gọi binary bằng full path Homebrew.

Tham khảo: [Homebrew PostgreSQL formula](https://formulae.brew.sh/formula/postgresql@18) và [PostgreSQL macOS packages](https://www.postgresql.org/download/macosx/).

## Retention và quyền riêng tư

- Database metadata không thay thế policy retention cho video/evidence.
- Xóa camera không xóa lịch sử; xóa video có job bị chặn.
- Cần bổ sung scheduled retention, legal hold, access audit và soft-delete ở phase production.
- Plate OCR là output chưa xác minh, không dùng như identity đã được chứng thực.
