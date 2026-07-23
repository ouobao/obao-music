import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProcessDiagnostics,
  sanitizeDiagnosticUrl,
  sanitizeDiagnosticValue
} from './processDiagnostics.cts';

describe('process diagnostics', () => {
  it('redacts secrets and strips URL paths, queries, and fragments', () => {
    const sanitized = sanitizeDiagnosticValue({
      token: 'provider-secret',
      requestUrl: 'https://music.example.test/song/42?token=provider-secret#player',
      message: 'request failed at https://music.example.test/song/42?token=provider-secret'
    }) as Record<string, string>;

    expect(sanitized.token).toBe('[redacted]');
    expect(sanitized.requestUrl).toBe('https://music.example.test');
    expect(sanitized.message).not.toContain('provider-secret');
    expect(sanitizeDiagnosticUrl('file:///C:/Users/example/private.html')).toBe('file:///[redacted]');
  });

  it('redacts complete Bearer and Basic authorization credentials', () => {
    const bearerCredential = 'eyJhbGciOiJIUzI1NiJ9.payload.signature';
    const basicCredential = 'dXNlcjpwYXNz==';
    const sanitized = sanitizeDiagnosticValue({
      message: [
        `Authorization: Bearer ${bearerCredential}`,
        `Authorization=Basic ${basicCredential}`,
        `authorization: Bearer first.segment second.segment`,
        `{"Authorization":"Bearer ${bearerCredential}","authorization":"Basic ${basicCredential}"}`
      ].join('; ')
    }) as Record<string, string>;

    expect(sanitized.message).not.toContain(bearerCredential);
    expect(sanitized.message).not.toContain(basicCredential);
    expect(sanitized.message).not.toContain('first.segment');
    expect(sanitized.message).not.toContain('second.segment');
  });

  it('writes JSONL records with a stable run id and explicit shutdown reason', () => {
    const filePath = createRuntimeFilePath('events.jsonl');
    const diagnostics = createProcessDiagnostics({
      filePath,
      pid: 42,
      runId: 'run-1',
      now: () => new Date('2026-07-22T08:00:00.000Z')
    });

    diagnostics.log('process-start', { url: 'https://music.example.test/private?q=secret' });
    diagnostics.markShutdownReason('tray-quit');

    const records = readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      timestamp: '2026-07-22T08:00:00.000Z',
      runId: 'run-1',
      pid: 42,
      processType: 'browser',
      event: 'process-start'
    });
    expect(records[0].details.url).toBe('https://music.example.test');
    expect(records[1].details.reason).toBe('tray-quit');
  });

  it('rotates bounded archives and writes a renderer-ready marker', () => {
    const filePath = createRuntimeFilePath('rotating.jsonl');
    const markerPath = createRuntimeFilePath('renderer-ready.json');
    const diagnostics = createProcessDiagnostics({
      filePath,
      maxBytes: 180,
      maxArchives: 2,
      pid: 84,
      runId: 'run-rotate'
    });

    diagnostics.log('first-event', { message: 'x'.repeat(120) });
    diagnostics.log('second-event', { message: 'y'.repeat(120) });

    expect(existsSync(`${filePath}.1`)).toBe(true);
    expect(diagnostics.writeRendererReadyMarker(markerPath, { source: 'preload' })).toBe(true);
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toMatchObject({
      runId: 'run-rotate',
      pid: 84,
      generation: 1,
      state: 'renderer-ready'
    });

    expect(diagnostics.invalidateRendererReadyMarker(markerPath, 'render-process-gone', {
      reason: 'oom'
    })).toBe(true);
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toMatchObject({
      runId: 'run-rotate',
      pid: 84,
      generation: 2,
      state: 'invalid',
      reason: 'render-process-gone'
    });

    expect(diagnostics.writeRendererReadyMarker(markerPath)).toBe(true);
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toMatchObject({
      generation: 3,
      state: 'renderer-ready'
    });
  });
});

function createRuntimeFilePath(name: string): string {
  const runtimeDirectory = join(process.cwd(), '.runtime', `diagnostics-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(runtimeDirectory, { recursive: true });
  return join(runtimeDirectory, name);
}
