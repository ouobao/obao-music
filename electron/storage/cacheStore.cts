import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path = require('node:path');
import type { CacheStore, CacheStoreOptions } from './schema.cjs';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
  byteSize: number;
  serializedValue?: string | null;
}

interface PendingCacheLoad {
  promise: Promise<unknown>;
  invalidated: boolean;
}

export interface FileCacheStore extends CacheStore {
  flush(): Promise<void>;
}

const defaultMaxEntries = 500;
const defaultMaxBytes = 16 * 1024 * 1024;
const defaultPersistDelayMs = 240;

export function createMemoryCacheStore(options: CacheStoreOptions = {}): CacheStore {
  const now = options.now ?? (() => Date.now());
  return createCacheStore(new Map(), now, () => undefined, options);
}

export function createFileCacheStore(filePath: string, options: CacheStoreOptions = {}): FileCacheStore {
  const now = options.now ?? (() => Date.now());
  const entries = loadCacheEntries(filePath, now);
  const writer = createDeferredCacheWriter(filePath, entries, options.persistDelayMs ?? defaultPersistDelayMs);
  const store = createCacheStore(entries, now, writer.schedule, options);

  return {
    ...store,
    flush: writer.flush
  };
}

function createCacheStore(
  entries: Map<string, CacheEntry<unknown>>,
  now: () => number,
  persist: () => void,
  options: CacheStoreOptions
): CacheStore {
  const maxEntries = Math.max(1, options.maxEntries ?? defaultMaxEntries);
  const maxBytes = Math.max(1, options.maxBytes ?? defaultMaxBytes);
  const pendingLoads = new Map<string, PendingCacheLoad>();

  const invalidatePendingLoad = (key: string) => {
    const pendingLoad = pendingLoads.get(key);
    if (!pendingLoad) {
      return;
    }

    pendingLoad.invalidated = true;
    pendingLoads.delete(key);
  };

  const prune = () => {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) {
        entries.delete(key);
      }
    }

    let totalBytes = getTotalByteSize(entries);
    while (entries.size > maxEntries || totalBytes > maxBytes) {
      const oldest = getLeastRecentlyUsedEntry(entries);
      if (!oldest) {
        return;
      }
      entries.delete(oldest.key);
      totalBytes -= oldest.entry.byteSize;
    }
  };

  const setEntry = <T,>(key: string, value: T, ttlMs: number) => {
    const currentTime = now();
    const serializedValue = serializeCacheValue(value);
    entries.set(key, {
      value,
      expiresAt: currentTime + ttlMs,
      lastAccessedAt: currentTime,
      byteSize: getSerializedByteSize(serializedValue),
      serializedValue
    });
    prune();
    persist();
  };

  return {
    get<T>(key: string) {
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }

      if (entry.expiresAt <= now()) {
        entries.delete(key);
        persist();
        return null;
      }

      entry.lastAccessedAt = now();
      return entry.value as T;
    },

    set<T>(key: string, value: T, ttlMs: number) {
      invalidatePendingLoad(key);
      setEntry(key, value, ttlMs);
    },

    getOrSet<T>(key: string, ttlMs: number, load: () => Promise<T>) {
      const cached = this.get<T>(key);
      if (cached !== null) {
        return Promise.resolve(cached);
      }

      const currentPendingLoad = pendingLoads.get(key);
      if (currentPendingLoad) {
        return currentPendingLoad.promise as Promise<T>;
      }

      const pendingLoad: PendingCacheLoad = {
        promise: Promise.resolve(),
        invalidated: false
      };
      pendingLoad.promise = Promise.resolve()
        .then(load)
        .then((value) => {
          if (!pendingLoad.invalidated && pendingLoads.get(key) === pendingLoad) {
            setEntry(key, value, ttlMs);
          }
          return value;
        })
        .finally(() => {
          if (pendingLoads.get(key) === pendingLoad) {
            pendingLoads.delete(key);
          }
        });
      pendingLoads.set(key, pendingLoad);
      return pendingLoad.promise as Promise<T>;
    },

    delete(key: string) {
      invalidatePendingLoad(key);
      if (entries.delete(key)) {
        persist();
      }
    },

    deleteByPrefix(prefix: string) {
      let changed = false;
      for (const key of pendingLoads.keys()) {
        if (key.startsWith(prefix)) {
          invalidatePendingLoad(key);
        }
      }

      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) {
          entries.delete(key);
          changed = true;
        }
      }

      if (changed) {
        persist();
      }
    },

    clear() {
      for (const key of pendingLoads.keys()) {
        invalidatePendingLoad(key);
      }

      if (entries.size === 0) {
        return;
      }
      entries.clear();
      persist();
    }
  };
}

function createDeferredCacheWriter(
  filePath: string,
  entries: Map<string, CacheEntry<unknown>>,
  delayMs: number
) {
  let timer: NodeJS.Timeout | null = null;
  let pendingWrite = Promise.resolve();

  const enqueueWrite = () => {
    const snapshot = serializeCacheEntries(entries);
    const temporaryPath = `${filePath}.tmp`;
    pendingWrite = pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await writeFile(temporaryPath, snapshot, 'utf8');
        await rename(temporaryPath, filePath);
      })
      .catch(() => undefined);
  };

  const schedule = () => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      enqueueWrite();
    }, delayMs);
  };

  return {
    schedule,
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        enqueueWrite();
      }
      await pendingWrite;
    }
  };
}

function loadCacheEntries(filePath: string, now: () => number): Map<string, CacheEntry<unknown>> {
  if (!existsSync(filePath)) {
    return new Map();
  }

  try {
    const currentTime = now();
    const rawEntries = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, Partial<CacheEntry<unknown>>>;
    return new Map(
      Object.entries(rawEntries).flatMap(([key, value]) => {
        if (!isCacheEntry(value) || value.expiresAt <= currentTime) {
          return [];
        }

        return [[key, {
          value: value.value,
          expiresAt: value.expiresAt,
          lastAccessedAt: typeof value.lastAccessedAt === 'number' ? value.lastAccessedAt : currentTime,
          byteSize: typeof value.byteSize === 'number'
            ? value.byteSize
            : getSerializedByteSize(serializeCacheValue(value.value))
        }]];
      })
    );
  } catch {
    return new Map();
  }
}

function isCacheEntry(value: Partial<CacheEntry<unknown>>): value is CacheEntry<unknown> {
  return typeof value === 'object' && value !== null && typeof value.expiresAt === 'number' && 'value' in value;
}

function getLeastRecentlyUsedEntry(entries: Map<string, CacheEntry<unknown>>) {
  let oldest: { key: string; entry: CacheEntry<unknown> } | null = null;
  for (const [key, entry] of entries) {
    if (!oldest || entry.lastAccessedAt < oldest.entry.lastAccessedAt) {
      oldest = { key, entry };
    }
  }
  return oldest;
}

function getTotalByteSize(entries: Map<string, CacheEntry<unknown>>) {
  let total = 0;
  for (const entry of entries.values()) {
    total += entry.byteSize;
  }
  return total;
}

function serializeCacheEntries(entries: Map<string, CacheEntry<unknown>>) {
  const serializedEntries: string[] = [];
  for (const [key, entry] of entries) {
    const serializedValue = entry.serializedValue === undefined
      ? serializeCacheValue(entry.value)
      : entry.serializedValue;
    entry.serializedValue = serializedValue;
    if (serializedValue === null) {
      continue;
    }

    const serializedMetadata = JSON.stringify({
      expiresAt: entry.expiresAt,
      lastAccessedAt: entry.lastAccessedAt,
      byteSize: entry.byteSize
    });
    serializedEntries.push(`${JSON.stringify(key)}:{"value":${serializedValue},${serializedMetadata.slice(1)}`);
  }
  return `{${serializedEntries.join(',')}}`;
}

function serializeCacheValue(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

function getSerializedByteSize(serializedValue: string | null) {
  return serializedValue === null ? 0 : Buffer.byteLength(serializedValue, 'utf8');
}
