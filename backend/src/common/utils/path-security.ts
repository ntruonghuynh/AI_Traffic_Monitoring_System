import { BadRequestException } from '@nestjs/common';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function assertSafeRelativePath(value: string): string {
  if (!value || value.includes('\0') || isAbsolute(value)) {
    throw new BadRequestException('Artifact path phải là đường dẫn tương đối hợp lệ');
  }
  const normalized = value.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part === '' || part === '.')) {
    throw new BadRequestException('Artifact path chứa thành phần không an toàn');
  }
  return parts.join('/');
}

export function resolveInside(root: string, relativePath: string): string {
  const safePath = assertSafeRelativePath(relativePath);
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, safePath);
  const relation = relative(absoluteRoot, target);
  if (relation.startsWith(`..${sep}`) || relation === '..' || isAbsolute(relation)) {
    throw new BadRequestException('Đường dẫn nằm ngoài storage boundary');
  }
  return target;
}
