import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

const ALLOWED_VIDEO_TYPES = new Map<string, Set<string>>([
  ['.mp4', new Set(['video/mp4'])],
  ['.mov', new Set(['video/quicktime'])],
  ['.avi', new Set(['video/x-msvideo', 'video/avi'])],
  ['.mkv', new Set(['video/x-matroska', 'video/mkv'])],
  ['.webm', new Set(['video/webm'])],
]);

export function validateVideoFile(file: Express.Multer.File, maxSize: number): string {
  if (!file?.buffer?.length) throw new BadRequestException('Thiếu file video hoặc file rỗng');
  if (file.size > maxSize) throw new BadRequestException('Video vượt quá giới hạn upload');
  const extension = extname(file.originalname).toLowerCase();
  const mimeTypes = ALLOWED_VIDEO_TYPES.get(extension);
  if (!mimeTypes?.has(file.mimetype)) throw new BadRequestException('Định dạng video không được hỗ trợ');
  if (!hasKnownSignature(file.buffer, extension)) throw new BadRequestException('Nội dung file không khớp định dạng video');
  return extension;
}

export function isAllowedVideoMetadata(filename: string, mimeType: string): boolean {
  return ALLOWED_VIDEO_TYPES.get(extname(filename).toLowerCase())?.has(mimeType) ?? false;
}

function hasKnownSignature(buffer: Buffer, extension: string): boolean {
  if (buffer.length < 12) return false;
  if (extension === '.mp4' || extension === '.mov') return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (extension === '.avi') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'AVI ';
  }
  if (extension === '.mkv' || extension === '.webm') {
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}
