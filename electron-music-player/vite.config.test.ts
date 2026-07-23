import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vite bundle split config', () => {
  it('keeps heavy runtime libraries in stable manual chunks', () => {
    const source = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(source).toContain('manualChunks');
    expect(source).toContain('chunkSizeWarningLimit: 550');
    expect(source).toContain('strictPort: true');
    expect(source).toContain("'react-vendor'");
    expect(source).toContain("'three-vendor'");
    expect(source).toContain("'gsap-vendor'");
  });
});
