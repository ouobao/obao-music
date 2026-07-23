import { randomUUID } from 'node:crypto';
import type { ProviderId } from './providers/types.cjs';

export const AUDIO_SOURCE_SCHEME = 'musicplayer-audio';

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export interface RegisteredAudioSource {
  providerId: ProviderId;
  url: string;
}

interface StoredAudioSource extends RegisteredAudioSource {
  createdAt: number;
}

interface AudioSourceRegistryOptions {
  createId?: () => string;
  now?: () => number;
  ttlMs?: number;
}

export interface AudioSourceRegistry {
  register(source: RegisteredAudioSource): string;
  resolve(sourceUrl: string): RegisteredAudioSource | null;
}

export function createAudioSourceRegistry(options: AudioSourceRegistryOptions = {}): AudioSourceRegistry {
  const sources = new Map<string, StoredAudioSource>();
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  function pruneExpiredSources() {
    const expiresBefore = now() - ttlMs;
    for (const [sourceId, source] of sources) {
      if (source.createdAt < expiresBefore) {
        sources.delete(sourceId);
      }
    }
  }

  return {
    register(source) {
      pruneExpiredSources();
      const sourceId = createId();
      sources.set(sourceId, {
        ...source,
        createdAt: now()
      });

      return `${AUDIO_SOURCE_SCHEME}://source/${encodeURIComponent(sourceId)}`;
    },

    resolve(sourceUrl) {
      pruneExpiredSources();
      const sourceId = parseSourceId(sourceUrl);
      if (!sourceId) {
        return null;
      }

      const source = sources.get(sourceId);
      if (!source) {
        return null;
      }

      return {
        providerId: source.providerId,
        url: source.url
      };
    }
  };
}

function parseSourceId(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== `${AUDIO_SOURCE_SCHEME}:` || url.hostname !== 'source') {
      return '';
    }

    return decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}
