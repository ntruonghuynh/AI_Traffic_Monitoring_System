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
| POST | `/cameras` | Tạo camera metadata; cần `X-Internal-Token` |
| GET | `/cameras?page=1&limit=20&status=ACTIVE` | Danh sách phân trang |
| GET | `/cameras/:id` | Chi tiết |
| PATCH | `/cameras/:id` | Cập nhật metadata; cần `X-Internal-Token` |
| DELETE | `/cameras/:id` | Xóa camera, giữ video và set `cameraId=null`; cần `X-Internal-Token` |

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
| POST | `/videos/upload` | Multipart field `file`, optional `cameraId`; cần `X-Internal-Token` |
| GET | `/videos` | Phân trang, filter `cameraId` |
| GET | `/videos/:id` | Metadata video |
| GET | `/videos/:id/jobs` | Job của video |
| DELETE | `/videos/:id` | Chỉ khi video chưa có job; cần `X-Internal-Token` |

Format hỗ trợ: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`. Backend kiểm tra extension, MIME, signature cơ bản và `MAX_UPLOAD_SIZE`. Tên file nội bộ là UUID; response không lộ storage key.

```bash
curl -F "file=@/path/to/input.mp4" \
  -F "cameraId=11111111-1111-4111-8111-111111111111" \
  -H "X-Internal-Token: <token>" \
  http://localhost:3000/api/v1/videos/upload
```

## Processing Job

| Method | Route | Mục đích |
|---|---|---|
| POST | `/jobs` | Tạo job `PENDING` cho video tồn tại; cần `X-Internal-Token` |
| GET | `/jobs` | Filter `status`, `videoId`, phân trang |
| GET | `/jobs/:id` | Chi tiết job |
| GET | `/jobs/:id/events` | Event thuộc job |

```json
{
  "videoId": "<video-uuid>"
}
```

```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "X-Internal-Token: <token>" \
  -H 'Content-Type: application/json' \
  -d '{"videoId":"<video-uuid>"}'
```

Tạo job không gọi Python và không giả lập completion. Worker/Redis thuộc phase sau.

## Detection Event và Evidence

| Method | Route | Mục đích |
|---|---|---|
| GET | `/events` | Filter/phân trang/stable sort |
| GET | `/events/:id` | Chi tiết event + raw payload |
| GET | `/events/:id/evidence` | Metadata evidence, không lộ path |
| GET | `/evidence/:id/content` | Nội dung asset; cần `X-Internal-Token` |
| PATCH | `/events/:id/review` | Review nội bộ; cần `X-Internal-Token` |

Filter event: `videoId`, `jobId`, `cameraId`, `eventType`, `reviewStatus`, `vehicleType`, `plateNumber`, `hasPlate`, `minConfidence`, `from`, `to`, `minTimestampSeconds`, `page`, `limit`. `hasPlate` nhận `true|false`; `minConfidence` nằm trong `0..1`. `cameraId` lọc qua video của job. `from`/`to` lọc `createdAt`.

Review:

```bash
curl -X PATCH http://localhost:3000/api/v1/events/<event-uuid>/review \
  -H "X-Internal-Token: <token>" \
  -H 'Content-Type: application/json' \
  -d '{"reviewStatus":"VERIFIED_CROSSING","note":"Đã kiểm tra hình ảnh"}'
```

## Statistics

| Method | Route | Query | Response |
|---|---|---|---|
| GET | `/stats/overview` | Không | `{ cameras: { total, byStatus }, videos: { total }, jobs: { total, byStatus }, events: { total, byReviewStatus } }`; các bucket trạng thái có count 0 vẫn được trả. |
| GET | `/stats/events?groupBy=...&from=<ISO>&to=<ISO>` | `groupBy` nhận `day`, `vehicleType` hoặc `reviewStatus` và là bắt buộc; `from` mặc định 30 ngày trước `to`, `to` mặc định hiện tại | `{ groupBy, items: [{ key, count }] }`. Ngày nhóm theo UTC; vehicleType chưa xác định có thể có `key: null`. |

`from` và `to` phải là ISO date-time; `from` không được lớn hơn `to`. Hai route thống kê là GET công khai, không cần `X-Internal-Token`.

Các route ghi/review/content được liệt kê ở trên yêu cầu token trong mọi môi trường. Tạo token bằng `openssl rand -hex 32` và thay giá trị mẫu trong `.env`; token mẫu bị từ chối trong production, còn token thật hợp lệ được chấp nhận. Các GET khác, health và Swagger vẫn công khai. API đọc còn lại cũng chỉ nên bind trong trusted development network ở Phase 02.

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
