# Phase 02 — REST API

Base URL: `http://localhost:3000/api/v1`

Swagger UI: `http://localhost:3000/api/docs`

## Response lỗi

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": ["cameraId must be a UUID"],
  "path": "/api/v1/videos/upload",
  "timestamp": "2026-10-15T08:00:00.000Z"
}
```

Stack trace, credentials và absolute filesystem paths không được trả về response production.

## Camera

| Method | Route | Mục đích |
|---|---|---|
| POST | `/cameras` | Tạo camera metadata |
| GET | `/cameras?page=1&limit=20&status=ACTIVE` | Danh sách phân trang |
| GET | `/cameras/:id` | Chi tiết |
| PATCH | `/cameras/:id` | Cập nhật metadata |
| DELETE | `/cameras/:id` | Xóa camera, giữ video và set `cameraId=null` |

```json
{
  "name": "Camera cổng A",
  "location": "Khuôn viên thử nghiệm",
  "sourceType": "FILE_UPLOAD",
  "status": "ACTIVE",
  "configuration": {
    "line": [[0.0, 0.48], [1.0, 0.48]]
  }
}
```

## Video

| Method | Route | Mục đích |
|---|---|---|
| POST | `/videos/upload` | Multipart field `file`, optional `cameraId` |
| GET | `/videos` | Phân trang, filter `cameraId` |
| GET | `/videos/:id` | Metadata video |
| GET | `/videos/:id/jobs` | Job của video |
| DELETE | `/videos/:id` | Chỉ khi video chưa có job |

Format hỗ trợ: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`. Backend kiểm tra extension, MIME, signature cơ bản và `MAX_UPLOAD_SIZE`. Tên file nội bộ là UUID; response không lộ storage key.

```bash
curl -F "file=@/path/to/input.mp4" \
  -F "cameraId=11111111-1111-4111-8111-111111111111" \
  http://localhost:3000/api/v1/videos/upload
```

## Processing Job

| Method | Route | Mục đích |
|---|---|---|
| POST | `/jobs` | Tạo job `PENDING` cho video tồn tại |
| GET | `/jobs` | Filter `status`, `videoId`, phân trang |
| GET | `/jobs/:id` | Chi tiết job |
| GET | `/jobs/:id/events` | Event thuộc job |

```json
{
  "videoId": "<video-uuid>"
}
```

Tạo job không gọi Python và không giả lập completion. Worker/Redis thuộc phase sau.

## Detection Event và Evidence

| Method | Route | Mục đích |
|---|---|---|
| GET | `/events` | Filter/phân trang/stable sort |
| GET | `/events/:id` | Chi tiết event + raw payload |
| GET | `/events/:id/evidence` | Metadata evidence, không lộ path |
| GET | `/evidence/:id/content` | Nội dung asset, cần internal token ở development |
| PATCH | `/events/:id/review` | Review nội bộ, cần internal token |

Filter event: `videoId`, `jobId`, `eventType`, `reviewStatus`, `vehicleType`, `plateNumber`, `from`, `to`, `minTimestampSeconds`, `page`, `limit`.

Review development-only:

```bash
curl -X PATCH http://localhost:3000/api/v1/events/<event-uuid>/review \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Token: <INTERNAL_API_TOKEN>' \
  -d '{"reviewStatus":"VERIFIED_CROSSING","note":"Đã kiểm tra hình ảnh"}'
```

Endpoint mutation/content bị từ chối trong `NODE_ENV=production` cho đến khi có authentication/RBAC. API đọc còn lại cũng chỉ nên bind trong trusted development network ở Phase 02.

## Health

| Route | Ý nghĩa |
|---|---|
| GET `/health/live` | Process ứng dụng sống; không phụ thuộc DB |
| GET `/health/ready` | PostgreSQL query được; trả 503 khi chưa sẵn sàng |
| GET `/health` | Tổng hợp `alive` và `ready` |

## Import AI local

Không có public HTTP endpoint import. Chạy CLI trong trusted environment:

```bash
npm run import:ai -- \
  --job-id <processing-job-uuid> \
  --file /absolute/path/to/results/results.json \
  --result-root /absolute/path/to/results
```

`--file` phải nằm trong `--result-root`. Artifact path trong JSON phải tương đối và không được thoát trusted root qua `..` hoặc symlink.
