import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants, createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSafeRelativePath, resolveInside } from '../common/utils/path-security';

export interface StorageByteRange { start: number; end: number }

export interface StorageStreamFile {
  size: number;
  createReadStream(range?: StorageByteRange): ReadStream;
}

@Injectable()
export class LocalStorageService {
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(process.cwd(), config.getOrThrow<string>('STORAGE_ROOT'));
    if (this.root === parse(this.root).root) {
      throw new Error('STORAGE_ROOT không được là filesystem root');
    }
  }

  async saveVideo(buffer: Buffer, extension: string): Promise<string> {
    const storageKey = `videos/${randomUUID()}${extension.toLowerCase()}`;
    await this.writeExclusive(storageKey, buffer);
    return storageKey;
  }

  async copyTrustedArtifact(sourceRoot: string, relativePath: string, storageKey: string): Promise<boolean> {
    const safeSourcePath = assertSafeRelativePath(relativePath);
    const rootReal = await realpath(resolve(sourceRoot));
    const sourceReal = await realpath(resolveInside(rootReal, safeSourcePath));
    const relation = relative(rootReal, sourceReal);
    if (relation.startsWith(`..${sep}`) || relation === '..' || relation.startsWith('..') || relation === '') {
      if (relation !== '') throw new BadRequestException('Artifact symlink thoát khỏi trusted result root');
    }
    const sourceStat = await stat(sourceReal);
    if (!sourceStat.isFile()) throw new BadRequestException('Artifact nguồn không phải file');

    const destination = resolveInside(this.root, storageKey);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await copyFile(sourceReal, destination, constants.COPYFILE_EXCL);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(resolveInside(this.root, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('Không tìm thấy asset');
      throw error;
    }
  }

  async openStreamFile(storageKey: string): Promise<StorageStreamFile> {
    try {
      const target = resolveInside(this.root, storageKey);
      const rootReal = await realpath(this.root);
      const targetReal = await realpath(target);
      const relation = relative(rootReal, targetReal);
      if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new NotFoundException('Không tìm thấy video');
      }
      const fileStat = await stat(targetReal);
      if (!fileStat.isFile()) throw new NotFoundException('Không tìm thấy video');
      return {
        size: fileStat.size,
        createReadStream: (range) => createReadStream(targetReal, range),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw new NotFoundException('Không tìm thấy video');
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new NotFoundException('Không tìm thấy video');
      throw new InternalServerErrorException('Không thể đọc video');
    }
  }

  async delete(storageKey: string): Promise<void> {
    await rm(resolveInside(this.root, storageKey), { force: true });
  }

  private async writeExclusive(storageKey: string, buffer: Buffer): Promise<void> {
    const destination = resolveInside(this.root, storageKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, buffer, { flag: 'wx' });
  }
}
