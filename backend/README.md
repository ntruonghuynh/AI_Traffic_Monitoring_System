# Traffic Monitoring Backend

Backend Phase 02 cung cấp REST API và PostgreSQL persistence cho camera, video upload, AI processing job, candidate event và evidence. Backend không chạy YOLO trực tiếp; kết quả AI được import từ `results.json` bằng trusted local CLI.

## Yêu cầu

- Node.js `>=22.18`; khuyến nghị Node.js 24 LTS. Node.js 26 hiện tại của workspace cũng được dùng để validate.
- npm 11+.
- PostgreSQL 16+.

## Cài đặt

```bash
cd backend
npm install
cp .env.example .env
```

Tạo PostgreSQL local trên macOS:

```bash
brew install postgresql@18
brew services start postgresql@18
createuser --pwprompt traffic_app
createdb --owner=traffic_app traffic_monitoring
```

Cập nhật mật khẩu trong `DATABASE_URL`, sau đó:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API: `http://localhost:3000/api/v1`

Swagger: `http://localhost:3000/api/docs`

## Environment

| Biến | Mục đích |
|---|---|
| `DATABASE_URL` | PostgreSQL direct connection URL |
| `PORT` | HTTP port, mặc định 3000 |
| `NODE_ENV` | `development`, `test`, `production` |
| `STORAGE_ROOT` | Root local storage; relative path được resolve từ `backend/` |
| `MAX_UPLOAD_SIZE` | Byte limit cho multipart upload |
| `CORS_ORIGIN` | Danh sách origin cách nhau bởi dấu phẩy |
| `INTERNAL_API_TOKEN` | Token development cho review/evidence content |

Không commit `.env`. `storage/`, generated Prisma Client, build và coverage đều bị ignore.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
npm test
npm run test:cov
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
```

## AI result import

1. Tạo video metadata/upload.
2. `POST /api/v1/jobs` để lấy job UUID `PENDING`.
3. Worker tương lai chạy Python với chính UUID đó.
4. Import kết quả:

```bash
npm run import:ai -- \
  --job-id <job-uuid> \
  --file /path/to/result-dir/results.json \
  --result-root /path/to/result-dir
```

Importer hỗ trợ schema `1.0`, validate toàn bộ payload trước mutation, dùng transaction, upsert theo `(jobId, sourceEventId)` và copy evidence vào storage boundary. OCR nullable được giữ nguyên. `LINE_CROSSING_CANDIDATE` không được đổi thành kết luận vi phạm đèn đỏ.

## Cấu trúc

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── ai-results/
│   ├── cameras/
│   ├── common/
│   ├── detection-events/
│   ├── evidence/
│   ├── health/
│   ├── prisma/
│   ├── processing-jobs/
│   ├── storage/
│   └── videos/
└── test/
```

## Kiểm thử

Unit tests dùng mock Prisma và synthetic JSON, không cần model weights hoặc PostgreSQL:

```bash
npm test
npm run test:cov
```

Migration/integration test cần một database test riêng. Không trỏ test vào database production hoặc database không rõ nguồn.

```bash
TEST_DATABASE_URL='postgresql://.../traffic_monitoring_test' npm run test:integration
```

Integration test tự skip nếu thiếu `TEST_DATABASE_URL` và từ chối URL có tên database không kết thúc bằng `_test`.

## Giới hạn Phase 02

- Chưa có Redis worker, Docker, frontend, RTSP hoặc production authentication.
- Evidence content/review chỉ có internal development token và bị khóa trong production.
- Không có benchmark AI mới; Backend chỉ persistence/import contract.
- Cần triển khai object storage, retention, audit log đầy đủ và RBAC trước production.
- `npm audit` hiện báo advisory transitively trong Prisma CLI 7.10 (`deepmerge-ts`, `mysql2`); auto-fix đề xuất downgrade Prisma 6 nên không được áp dụng. Cần nâng khi Prisma phát hành bản 7.x đã xử lý và chạy lại validation.

Chi tiết: [kiến trúc](../docs/PHASE_02_ARCHITECTURE.md), [database](../docs/PHASE_02_DATABASE.md), [API](../docs/PHASE_02_API.md).
