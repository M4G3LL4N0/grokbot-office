// GrokBot Office — package-root resolution that works both from src/ (tsx)
// and from dist/src (built). Walks up until a package.json is found.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageRoot(fromUrl: string | URL = import.meta.url, marker = 'package.json'): string {
  let dir = dirname(fromUrl instanceof URL ? fileURLToPath(fromUrl) : fromUrl);
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(dir, marker))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return dir;
}

/** Absolute path to the package root (contains package.json). */
export const ROOT: string = packageRoot();