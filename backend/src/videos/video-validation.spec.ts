import { BadRequestException } from '@nestjs/common';
import { isAllowedVideoMetadata, validateVideoFile } from './video-validation';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const buffer = Buffer.alloc(16);
  buffer.write('ftyp', 4, 'ascii');
  return {
    fieldname: 'file',
    originalname: 'input.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: buffer.length,
    destination: '',
    filename: '',
    path: '',
    buffer,
    stream: undefined as never,
    ...overrides,
  };
}

describe('video validation', () => {
  it('chấp nhận metadata và signature MP4', () => {
    expect(validateVideoFile(makeFile(), 1024)).toBe('.mp4');
    expect(isAllowedVideoMetadata('video.webm', 'video/webm')).toBe(true);
  });

  it('từ chối extension hoặc MIME không cho phép', () => {
    expect(() => validateVideoFile(makeFile({ originalname: 'payload.exe' }), 1024)).toThrow(BadRequestException);
  });

  it('từ chối file quá size limit', () => {
    expect(() => validateVideoFile(makeFile({ size: 2048 }), 1024)).toThrow('vượt quá');
  });

  it('từ chối signature giả', () => {
    expect(() => validateVideoFile(makeFile({ buffer: Buffer.alloc(16) }), 1024)).toThrow('không khớp');
  });
});
