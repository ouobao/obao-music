import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import path = require('node:path');

type DiagnosticDetails = Record<string, unknown>;

export interface ProcessDiagnosticsOptions {
  filePath: string;
  maxBytes?: number;
  maxArchives?: number;
  now?: () => Date;
  pid?: number;
  runId?: string;
}

export interface ProcessDiagnostics {
  readonly runId: string;
  log(event: string, details?: DiagnosticDetails): void;
  logError(event: string, error: unknown, details?: DiagnosticDetails): void;
  markShutdownReason(reason: string, details?: DiagnosticDetails): void;
  getShutdownReason(): string;
  writeRendererReadyMarker(filePath: string, details?: DiagnosticDetails): boolean;
  invalidateRendererReadyMarker(filePath: string, reason: string, details?: DiagnosticDetails): boolean;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVES = 3;
const MAX_ARRAY_ITEMS = 24;
const MAX_OBJECT_ENTRIES = 48;
const MAX_NESTING_DEPTH = 5;
const MAX_TEXT_LENGTH = 2_048;
const SENSITIVE_KEY_PATTERN = /authorization|cookie|credential|password|secret|token|api[-_]?key|authst|g[_-]?tk|session[-_]?id/i;
const AUTHORIZATION_CREDENTIAL_PATTERN = /(\bauthorization\b\s*["']?\s*[:=]\s*["']?\s*)(?:bearer|basic)?\s*[^\r\n,;\}"']+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN = /\b(authorization|cookie|credential|password|secret|token|api[-_]?key|authst|g[_-]?tk|session[-_]?id)\s*[:=]\s*([^\s,;]+)/gi;
const URL_PATTERN = /(?:https?|file):\/\/[^\s"'<>]+/gi;

export function createProcessDiagnostics(options: ProcessDiagnosticsOptions): ProcessDiagnostics {
  const runId = options.runId ?? randomUUID();
  const pid = options.pid ?? process.pid;
  const now = options.now ?? (() => new Date());
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxArchives = Math.max(1, options.maxArchives ?? DEFAULT_MAX_ARCHIVES);
  let shutdownReason = 'running';
  let rendererReadyGeneration = 0;

  const log = (event: string, details: DiagnosticDetails = {}) => {
    const record = {
      timestamp: now().toISOString(),
      runId,
      pid,
      processType: 'browser',
      event: sanitizeDiagnosticText(event),
      details: sanitizeDiagnosticValue(details)
    };

    try {
      const line = `${JSON.stringify(record)}\n`;
      appendDiagnosticLine(options.filePath, line, maxBytes, maxArchives);
    } catch {
      // Diagnostics must never interfere with the application lifecycle.
    }
  };

  return {
    runId,
    log,
    logError(event, error, details = {}) {
      log(event, {
        ...details,
        error: serializeDiagnosticError(error)
      });
    },
    markShutdownReason(reason, details = {}) {
      if (shutdownReason === reason) {
        return;
      }

      shutdownReason = sanitizeDiagnosticText(reason);
      log('shutdown-reason', {
        ...details,
        reason: shutdownReason
      });
    },
    getShutdownReason() {
      return shutdownReason;
    },
    writeRendererReadyMarker(filePath, details = {}) {
      const generation = rendererReadyGeneration + 1;
      rendererReadyGeneration = generation;
      try {
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, JSON.stringify({
          timestamp: now().toISOString(),
          runId,
          pid,
          generation,
          state: 'renderer-ready',
          details: sanitizeDiagnosticValue(details)
        }), 'utf8');
        log('renderer-ready-marker-written', { marker: path.basename(filePath), generation });
        return true;
      } catch (error) {
        log('renderer-ready-marker-failed', { error: serializeDiagnosticError(error) });
        return false;
      }
    },
    invalidateRendererReadyMarker(filePath, reason, details = {}) {
      const generation = rendererReadyGeneration + 1;
      rendererReadyGeneration = generation;
      try {
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, JSON.stringify({
          timestamp: now().toISOString(),
          runId,
          pid,
          generation,
          state: 'invalid',
          reason: sanitizeDiagnosticText(reason),
          details: sanitizeDiagnosticValue(details)
        }), 'utf8');
        log('renderer-ready-marker-invalidated', {
          marker: path.basename(filePath),
          generation,
          reason
        });
        return true;
      } catch (error) {
        log('renderer-ready-marker-invalidation-failed', {
          error: serializeDiagnosticError(error),
          generation,
          reason
        });
        return false;
      }
    }
  };
}

export function sanitizeDiagnosticUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
    if (parsed.protocol === 'file:') {
      return 'file:///[redacted]';
    }
    return `${parsed.protocol}//[redacted]`;
  } catch {
    return '[invalid-url]';
  }
}

export function sanitizeDiagnosticValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeDiagnosticText(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return `[${typeof value}]`;
  }
  if (value instanceof Error) {
    return serializeDiagnosticError(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return sanitizeDiagnosticUrl(value.toString());
  }
  if (depth >= MAX_NESTING_DEPTH) {
    return '[max-depth]';
  }
  if (typeof value !== 'object') {
    return sanitizeDiagnosticText(String(value));
  }
  if (seen.has(value)) {
    return '[circular]';
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const sanitizedItems = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeDiagnosticValue(item, depth + 1, seen));
    seen.delete(value);
    return sanitizedItems;
  }

  const sanitizedRecord: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_ENTRIES)) {
    sanitizedRecord[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitizeDiagnosticValue(item, depth + 1, seen);
  }
  seen.delete(value);
  return sanitizedRecord;
}

function serializeDiagnosticError(error: unknown): DiagnosticDetails {
  if (!(error instanceof Error)) {
    return {
      name: 'NonError',
      message: sanitizeDiagnosticText(String(error))
    };
  }

  return {
    name: sanitizeDiagnosticText(error.name),
    message: sanitizeDiagnosticText(error.message),
    stack: sanitizeDiagnosticText(error.stack ?? '')
  };
}

function sanitizeDiagnosticText(value: string): string {
  let sanitized = value
    .replace(AUTHORIZATION_CREDENTIAL_PATTERN, '$1[redacted]')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1=[redacted]')
    .replace(URL_PATTERN, (url) => sanitizeDiagnosticUrl(url));

  const userProfile = process.env.USERPROFILE;
  if (userProfile) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(userProfile), 'gi'), '%USERPROFILE%');
  }

  return sanitized.slice(0, MAX_TEXT_LENGTH);
}

function appendDiagnosticLine(filePath: string, line: string, maxBytes: number, maxArchives: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const lineBytes = Buffer.byteLength(line, 'utf8');
  if (existsSync(filePath) && statSync(filePath).size + lineBytes > maxBytes) {
    try {
      rotateDiagnosticFiles(filePath, maxArchives);
    } catch {
      // A locked archive should not prevent appending to the active log.
    }
  }
  appendFileSync(filePath, line, 'utf8');
}

function rotateDiagnosticFiles(filePath: string, maxArchives: number): void {
  for (let index = maxArchives; index >= 1; index -= 1) {
    const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
    const target = `${filePath}.${index}`;
    if (!existsSync(source)) {
      continue;
    }
    if (existsSync(target)) {
      unlinkSync(target);
    }
    renameSync(source, target);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
