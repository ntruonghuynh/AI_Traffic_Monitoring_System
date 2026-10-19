CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "CameraSourceType" AS ENUM ('FILE_UPLOAD', 'RTSP_METADATA', 'OTHER');
CREATE TYPE "CameraStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "DetectionEventType" AS ENUM ('LINE_CROSSING_CANDIDATE');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED_CROSSING', 'REJECTED_CANDIDATE');
CREATE TYPE "EvidenceAssetType" AS ENUM ('IMAGE', 'ANNOTATED_VIDEO', 'OTHER');

CREATE TABLE "Camera" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sourceType" "CameraSourceType" NOT NULL DEFAULT 'FILE_UPLOAD',
    "status" "CameraStatus" NOT NULL DEFAULT 'ACTIVE',
    "configuration" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "cameraId" UUID,
    "originalFilename" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Video_fileSize_check" CHECK ("fileSize" >= 0),
    CONSTRAINT "Video_durationSeconds_check" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0),
    CONSTRAINT "Video_dimensions_check" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0))
);

CREATE TABLE "ProcessingJob" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "aiSchemaVersion" VARCHAR(20),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "totalFrames" INTEGER,
    "processedFrames" INTEGER,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcessingJob_counts_check" CHECK (
      ("totalFrames" IS NULL OR "totalFrames" >= 0) AND
      ("processedFrames" IS NULL OR "processedFrames" >= 0) AND
      "totalEvents" >= 0
    )
);

CREATE TABLE "DetectionEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceEventId" VARCHAR(100) NOT NULL,
    "trackId" INTEGER,
    "eventType" "DetectionEventType" NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "vehicleType" VARCHAR(80),
    "confidence" DOUBLE PRECISION,
    "plateNumber" VARCHAR(40),
    "plateRawText" VARCHAR(255),
    "plateConfidence" DOUBLE PRECISION,
    "frameIndex" INTEGER,
    "timestampSeconds" DOUBLE PRECISION,
    "crossingDirection" VARCHAR(80),
    "detectedAt" TIMESTAMPTZ(3),
    "reviewNote" VARCHAR(500),
    "reviewedAt" TIMESTAMPTZ(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "DetectionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DetectionEvent_values_check" CHECK (
      ("trackId" IS NULL OR "trackId" >= 0) AND
      ("frameIndex" IS NULL OR "frameIndex" >= 0) AND
      ("timestampSeconds" IS NULL OR "timestampSeconds" >= 0) AND
      ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)) AND
      ("plateConfidence" IS NULL OR ("plateConfidence" >= 0 AND "plateConfidence" <= 1))
    )
);

CREATE TABLE "EvidenceAsset" (
    "id" UUID NOT NULL,
    "jobId" UUID,
    "eventId" UUID,
    "assetType" "EvidenceAssetType" NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvidenceAsset_parent_check" CHECK (("jobId" IS NULL) <> ("eventId" IS NULL))
);

CREATE INDEX "Camera_status_idx" ON "Camera"("status");
CREATE INDEX "Camera_createdAt_idx" ON "Camera"("createdAt");
CREATE UNIQUE INDEX "Video_storageKey_key" ON "Video"("storageKey");
CREATE INDEX "Video_cameraId_idx" ON "Video"("cameraId");
CREATE INDEX "Video_uploadedAt_idx" ON "Video"("uploadedAt");
CREATE INDEX "ProcessingJob_videoId_idx" ON "ProcessingJob"("videoId");
CREATE INDEX "ProcessingJob_status_createdAt_idx" ON "ProcessingJob"("status", "createdAt");
CREATE INDEX "ProcessingJob_createdAt_idx" ON "ProcessingJob"("createdAt");
CREATE INDEX "DetectionEvent_jobId_createdAt_idx" ON "DetectionEvent"("jobId", "createdAt");
CREATE INDEX "DetectionEvent_eventType_reviewStatus_createdAt_idx" ON "DetectionEvent"("eventType", "reviewStatus", "createdAt");
CREATE INDEX "DetectionEvent_vehicleType_idx" ON "DetectionEvent"("vehicleType");
CREATE INDEX "DetectionEvent_plateNumber_idx" ON "DetectionEvent"("plateNumber");
CREATE INDEX "DetectionEvent_timestampSeconds_idx" ON "DetectionEvent"("timestampSeconds");
CREATE UNIQUE INDEX "DetectionEvent_jobId_sourceEventId_key" ON "DetectionEvent"("jobId", "sourceEventId");
CREATE UNIQUE INDEX "EvidenceAsset_storageKey_key" ON "EvidenceAsset"("storageKey");
CREATE INDEX "EvidenceAsset_jobId_idx" ON "EvidenceAsset"("jobId");
CREATE INDEX "EvidenceAsset_eventId_idx" ON "EvidenceAsset"("eventId");
CREATE INDEX "EvidenceAsset_assetType_idx" ON "EvidenceAsset"("assetType");

ALTER TABLE "Video" ADD CONSTRAINT "Video_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetectionEvent" ADD CONSTRAINT "DetectionEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAsset" ADD CONSTRAINT "EvidenceAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAsset" ADD CONSTRAINT "EvidenceAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DetectionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
