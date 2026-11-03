import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { ReadStream } from 'node:fs';
import type { Response } from 'express';
import type { StorageByteRange, StorageStreamFile } from './local-storage.service';

interface ParsedByteRange { range: StorageByteRange | null; unsatisfiable: boolean }

export interface StreamContent {
  stream: ReadStream | null;
  statusCode: 200 | 206 | 416;
  contentType: string;
  contentLength: number;
  contentRange?: string;
}

export function parseByteRange(header: string, size: number): ParsedByteRange {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return { range: null, unsatisfiable: true };

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { range: null, unsatisfiable: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      return { range: null, unsatisfiable: true };
    }
    end = Math.min(end, size - 1);
  }
  return { range: { start, end }, unsatisfiable: false };
}

export function prepareStreamContent(
  storedFile: StorageStreamFile,
  contentType: string,
  rangeHeader?: string,
): StreamContent {
  if (rangeHeader) {
    const parsed = parseByteRange(rangeHeader, storedFile.size);
    if (parsed.unsatisfiable || !parsed.range) {
      return {
        stream: null,
        statusCode: 416,
        contentType,
        contentLength: 0,
        contentRange: `bytes */${storedFile.size}`,
      };
    }
    return {
      stream: storedFile.createReadStream(parsed.range),
      statusCode: 206,
      contentType,
      contentLength: parsed.range.end - parsed.range.start + 1,
      contentRange: `bytes ${parsed.range.start}-${parsed.range.end}/${storedFile.size}`,
    };
  }

  return {
    stream: storedFile.createReadStream(),
    statusCode: 200,
    contentType,
    contentLength: storedFile.size,
  };
}

export function streamContentResponse(content: StreamContent, response: Response, filename: string): StreamableFile {
  response.status(content.statusCode);
  response.setHeader('Content-Type', content.contentType);
  response.setHeader('Content-Length', String(content.contentLength));
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  if (content.contentRange) response.setHeader('Content-Range', content.contentRange);

  if (content.stream) {
    const stream = content.stream;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      response.off('close', onResponseClose);
      stream.off('end', cleanup);
      stream.off('close', cleanup);
    };
    const onResponseClose = () => {
      if (!response.writableFinished && !stream.destroyed) stream.destroy();
      cleanup();
    };
    response.once('close', onResponseClose);
    stream.once('end', cleanup);
    stream.once('close', cleanup);
  }

  return new StreamableFile(content.stream ?? Readable.from([]));
}
