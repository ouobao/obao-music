import { create } from 'zustand';
import type {
  AlbumSummary,
  ArtistDetail,
  ArtistReference,
  RemoteProviderId
} from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';
import { useArtistCatalogStore } from './artistCatalogStore';
import type { ListeningHistoryEntry } from './listeningHistoryStore';
import { useListeningHistoryStore } from './listeningHistoryStore';
import { mapWithConcurrency } from '../utils/asyncScheduling';

export interface FrequentArtistAlbumsProviderState {
  albums: AlbumSummary[];
  isLoading: boolean;
  loaded: boolean;
  generationKey: string | null;
}

interface FrequentArtistAlbumsState {
  byProvider: Record<RemoteProviderId, FrequentArtistAlbumsProviderState>;
  load: (
    providerId: RemoteProviderId,
    excludedAlbums: readonly AlbumSummary[],
    options?: ProviderFetchOptions
  ) => Promise<AlbumSummary[]>;
  resetForTest: () => void;
}

export interface FrequentArtistAlbumSeed {
  artist: ArtistReference;
  score: number;
  lastPlayedAt: number;
}

export const FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
export const FREQUENT_ARTIST_ALBUM_SEED_LIMIT = 4;
export const FREQUENT_ARTIST_ALBUM_LIMIT = 6;

export const useFrequentArtistAlbumsStore = create<FrequentArtistAlbumsState>((set, get) => {
  const requestRevisions: Record<RemoteProviderId, number> = { qq: 0, netease: 0 };

  return {
    byProvider: createProviderStates(),

    load: async (providerId, excludedAlbums, options) => {
      const now = Date.now();
      const seeds = selectFrequentArtistAlbumSeeds(
        providerId,
        useListeningHistoryStore.getState().entries,
        now
      );
      const generationKey = createGenerationKey(providerId, seeds, excludedAlbums, now);
      const current = get().byProvider[providerId];
      if (!options?.forceRefresh && current.loaded && current.generationKey === generationKey) {
        return current.albums;
      }
      if (current.isLoading && current.generationKey === generationKey) {
        return current.albums;
      }

      const revision = ++requestRevisions[providerId];
      set((state) => ({
        byProvider: {
          ...state.byProvider,
          [providerId]: {
            ...state.byProvider[providerId],
            albums: seeds.length === 0 ? [] : state.byProvider[providerId].albums,
            isLoading: seeds.length > 0,
            loaded: seeds.length === 0,
            generationKey
          }
        }
      }));

      if (seeds.length === 0) {
        return [];
      }

      const artistDetails = (await mapWithConcurrency(seeds, 2, async (seed) => (
        useArtistCatalogStore.getState().loadArtistDetail(providerId, seed.artist.id)
      ))).filter((artist): artist is ArtistDetail => artist !== null);
      if (requestRevisions[providerId] !== revision) {
        return get().byProvider[providerId].albums;
      }

      const albums = selectFrequentArtistAlbums(providerId, artistDetails, excludedAlbums);
      set((state) => ({
        byProvider: {
          ...state.byProvider,
          [providerId]: {
            albums,
            isLoading: false,
            loaded: true,
            generationKey
          }
        }
      }));
      return albums;
    },

    resetForTest: () => {
      requestRevisions.qq += 1;
      requestRevisions.netease += 1;
      set({ byProvider: createProviderStates() });
    }
  };
});

export function selectFrequentArtistAlbumSeeds(
  providerId: RemoteProviderId,
  history: readonly ListeningHistoryEntry[],
  now = Date.now()
): FrequentArtistAlbumSeed[] {
  const byArtistIdentity = new Map<string, FrequentArtistAlbumSeed>();
  for (const entry of history) {
    if (
      entry.song.providerId !== providerId
      || now - entry.lastPlayedAt > FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS
    ) {
      continue;
    }

    for (const artist of entry.song.artists ?? []) {
      if (!isReliableArtistReference(providerId, artist)) {
        continue;
      }

      const identity = getArtistIdentity(artist);
      const recency = Math.max(0, 1 - ((now - entry.lastPlayedAt) / FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS));
      const score = Math.min(entry.qualifiedPlayCount, 20) * 2 + recency;
      const existing = byArtistIdentity.get(identity);
      if (existing) {
        existing.score += score;
        existing.lastPlayedAt = Math.max(existing.lastPlayedAt, entry.lastPlayedAt);
      } else {
        byArtistIdentity.set(identity, { artist, score, lastPlayedAt: entry.lastPlayedAt });
      }
    }
  }

  return [...byArtistIdentity.values()]
    .sort((left, right) => (
      right.score - left.score
      || right.lastPlayedAt - left.lastPlayedAt
      || getArtistIdentity(left.artist).localeCompare(getArtistIdentity(right.artist))
    ))
    .slice(0, FREQUENT_ARTIST_ALBUM_SEED_LIMIT);
}

export function selectFrequentArtistAlbums(
  providerId: RemoteProviderId,
  artistDetails: readonly ArtistDetail[],
  excludedAlbums: readonly AlbumSummary[]
): AlbumSummary[] {
  const excluded = new Set(excludedAlbums
    .filter((album) => isReliableAlbum(providerId, album))
    .map(getAlbumIdentity));
  const seen = new Set<string>();
  const selected: AlbumSummary[] = [];

  for (const artist of artistDetails) {
    if (!isReliableArtistReference(providerId, artist)) {
      continue;
    }

    const latestAlbum = [...artist.albums]
      .filter((album) => isReliableAlbum(providerId, album))
      .sort((left, right) => (
        parseReleaseDate(right.releaseDate!) - parseReleaseDate(left.releaseDate!)
        || getAlbumIdentity(left).localeCompare(getAlbumIdentity(right))
      ))[0];
    if (!latestAlbum) {
      continue;
    }

    const identity = getAlbumIdentity(latestAlbum);
    if (excluded.has(identity) || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    selected.push(latestAlbum);
    if (selected.length >= FREQUENT_ARTIST_ALBUM_LIMIT) {
      break;
    }
  }

  return selected;
}

function isReliableArtistReference(
  providerId: RemoteProviderId,
  artist: ArtistReference
): boolean {
  return artist.providerId === providerId
    && Boolean(artist.id.trim())
    && Boolean(artist.platformArtistId.trim());
}

function isReliableAlbum(
  providerId: RemoteProviderId,
  album: AlbumSummary
): boolean {
  return album.providerId === providerId
    && Boolean(album.id.trim())
    && Boolean(album.platformAlbumId.trim())
    && Boolean(album.title.trim())
    && Boolean(album.artistName.trim())
    && typeof album.releaseDate === 'string'
    && Number.isFinite(parseReleaseDate(album.releaseDate));
}

function createGenerationKey(
  providerId: RemoteProviderId,
  seeds: readonly FrequentArtistAlbumSeed[],
  excludedAlbums: readonly AlbumSummary[],
  now: number
): string {
  const date = new Date(now).toLocaleDateString('en-CA');
  const seedSignature = seeds.map((seed) => (
    `${getArtistIdentity(seed.artist)}:${seed.score}:${seed.lastPlayedAt}`
  )).join('|');
  const excludedSignature = excludedAlbums
    .filter((album) => isReliableAlbum(providerId, album))
    .map(getAlbumIdentity)
    .sort()
    .join('|');
  return `${date}:${providerId}:${stableHash(seedSignature)}:${stableHash(excludedSignature)}`;
}

function getArtistIdentity(artist: ArtistReference): string {
  return `${artist.providerId}:${artist.platformArtistId}`;
}

function getAlbumIdentity(album: AlbumSummary): string {
  return `${album.providerId}:${album.platformAlbumId}`;
}

function parseReleaseDate(releaseDate: string): number {
  return Date.parse(releaseDate);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createProviderStates(): Record<RemoteProviderId, FrequentArtistAlbumsProviderState> {
  return {
    qq: createProviderState(),
    netease: createProviderState()
  };
}

function createProviderState(): FrequentArtistAlbumsProviderState {
  return {
    albums: [],
    isLoading: false,
    loaded: false,
    generationKey: null
  };
}
