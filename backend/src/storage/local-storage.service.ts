import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, parse, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSafeRelativePath, resolveInside } from '../common/utils/path-security';

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

  async delete(storageKey: string): Promise<void> {
    await rm(resolveInside(this.root, storageKey), { force: true });
  }

  private async writeExclusive(storageKey: string, buffer: Buffer): Promise<void> {
    const destination = resolveInside(this.root, storageKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, buffer, { flag: 'wx' });
  }
}
