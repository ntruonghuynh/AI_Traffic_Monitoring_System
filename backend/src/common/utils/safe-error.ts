import { resolve } from 'node:path';

const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:\\|\/)(?:[^\s:'"<>|]+[\\/])*[^\s:'"<>|]*/g;
const QUOTED_ABSOLUTE_PATH_PATTERN = /"(?:[A-Za-z]:\\|\/)[^"\r\n]*"|'(?:[A-Za-z]:\\|\/)[^'\r\n]*'/g;

export function safeError(error: unknown, pathsToRedact: readonly string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const path of pathsToRedact) {
    if (path) message = message.replaceAll(resolve(path), '[path]');
  }
  return message
    .replace(QUOTED_ABSOLUTE_PATH_PATTERN, '[path]')
    .replace(ABSOLUTE_PATH_PATTERN, '[path]')
    .slice(0, 1_000);
}
