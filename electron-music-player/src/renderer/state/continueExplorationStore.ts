import { create } from 'zustand';
import type {
  ArtistDetail,
  ArtistReference,
  RemoteProviderId,
  Song
} from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';
import { useArtistCatalogStore } from './artistCatalogStore';
import {
  getSongIdentity,
  type ListeningHistoryEntry,
  useListeningHistoryStore
} from './listeningHistoryStore';
import { mapWithConcurrency } from '../utils/asyncScheduling';

export interface ContinueExplorationProviderState {
  songs: Song[];
  isLoading: boolean;
  loaded: boolean;
  generationKey: string | null;
  errorMessage: string | null;
}

interface ContinueExplorationState {
  byProvider: Record<RemoteProviderId, ContinueExplorationProviderState>;
  load: (
    providerId: RemoteProviderId,
    excludedSongs: readonly Song[],
    currentSong?: Song | null,
    options?: ProviderFetchOptions
  ) => Promise<Song[]>;
  resetForTest: () => void;
}

interface ExplorationSeed {
  artist: ArtistReference;
  score: number;
  lastPlayedAt: number;
}

interface CandidateGroup {
  seed: ExplorationSeed;
  songs: Song[];
}

const CONTINUE_EXPLORATION_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const CONTINUE_EXPLORATION_SEED_LIMIT = 3;
const CONTINUE_EXPLORATION_CANDIDATE_SEED_LIMIT = 6;
const CONTINUE_EXPLORATION_PER_ARTIST_LIMIT = 4;
const CONTINUE_EXPLORATION_SONG_LIMIT = 12;

export const useContinueExplorationStore = create<ContinueExplorationState>((set, get) => {
  const requestRevisions: Record<RemoteProviderId, number> = { qq: 0, netease: 0 };

  return {
    byProvider: createProviderStates(),

    load: async (providerId, excludedSongs, currentSong, options) => {
      const now = Date.now();
      const history = useListeningHistoryStore.getState().entries;
      const seeds = selectContinueExplorationSeeds(providerId, history, currentSong, now);
      const excludedIdentities = excludedSongs.map(getSongIdentity).sort();
      const generationKey = createGenerationKey(providerId, seeds, excludedIdentities, now);
      const current = get().byProvider[providerId];
      if (!options?.forceRefresh && current.loaded && current.generationKey === generationKey) {
        return current.songs;
      }
      if (current.isLoading && current.generationKey === generationKey) {
        return current.songs;
      }

      const revision = ++requestRevisions[providerId];
      set((state) => ({
        byProvider: {
          ...state.byProvider,
          [providerId]: {
            ...state.byProvider[providerId],
            isLoading: seeds.length > 0,
            loaded: seeds.length === 0,
            generationKey,
            errorMessage: null,
            ...(seeds.length === 0 ? { songs: [] } : {})
          }
        }
      }));

      if (seeds.length === 0) {
        return [];
      }

      try {
        const candidateGroups = await mapWithConcurrency(
          seeds,
          2,
          async (seed) => loadCandidateGroup(providerId, seed)
        );
        if (requestRevisions[providerId] !== revision) {
          return get().byProvider[providerId].songs;
        }

        const recentHistoryIdentities = new Set(history
          .filter((entry) => entry.song.providerId === providerId && now - entry.lastPlayedAt <= CONTINUE_EXPLORATION_HISTORY_WINDOW_MS)
          .map((entry) => getSongIdentity(entry.song)));
        const excluded = new Set([...excludedIdentities, ...recentHistoryIdentities]);
        const groups = candidateGroups
          .filter((group) => group.songs.length > 0)
          .slice(0, CONTINUE_EXPLORATION_SEED_LIMIT);
        const songs = selectContinueExplorationSongs(groups, excluded, generationKey);
        const hasCandidates = groups.length > 0;

        set((state) => ({
          byProvider: {
            ...state.byProvider,
            [providerId]: {
              songs,
              isLoading: false,
              loaded: true,
              generationKey,
              errorMessage: !hasCandidates ? '继续探索内容暂时无法加载' : null
            }
          }
        }));
        return songs;
      } catch (error) {
        if (requestRevisions[providerId] !== revision) {
          return get().byProvider[providerId].songs;
        }

        set((state) => ({
          byProvider: {
            ...state.byProvider,
            [providerId]: {
              ...state.byProvider[providerId],
              isLoading: false,
              loaded: true,
              errorMessage: error instanceof Error ? error.message : '继续探索内容加载失败'
            }
          }
        }));
        return current.songs;
      }
    },

    resetForTest: () => {
      requestRevisions.qq += 1;
      requestRevisions.netease += 1;
      set({ byProvider: createProviderStates() });
    }
  };
});

export function selectContinueExplorationSeeds(
  providerId: RemoteProviderId,
  history: readonly ListeningHistoryEntry[],
  currentSong: Song | null | undefined,
  now = Date.now()
): ExplorationSeed[] {
  const byArtistId = new Map<string, ExplorationSeed>();
  for (const entry of history) {
    if (
      entry.song.providerId !== providerId
      || now - entry.lastPlayedAt > CONTINUE_EXPLORATION_HISTORY_WINDOW_MS
    ) {
      continue;
    }

    for (const artist of entry.song.artists ?? []) {
      if (artist.providerId !== providerId) {
        continue;
      }

      const recency = Math.max(0, 1 - ((now - entry.lastPlayedAt) / CONTINUE_EXPLORATION_HISTORY_WINDOW_MS));
      const score = Math.min(entry.qualifiedPlayCount, 20) * 2 + recency;
      const existing = byArtistId.get(artist.id);
      if (existing) {
        existing.score += score;
        existing.lastPlayedAt = Math.max(existing.lastPlayedAt, entry.lastPlayedAt);
      } else {
        byArtistId.set(artist.id, { artist, score, lastPlayedAt: entry.lastPlayedAt });
      }
    }
  }

  const selected = [...byArtistId.values()]
    .sort((left, right) => right.score - left.score || right.lastPlayedAt - left.lastPlayedAt || left.artist.id.localeCompare(right.artist.id))
    .slice(0, CONTINUE_EXPLORATION_CANDIDATE_SEED_LIMIT);
  if (selected.length > 0) {
    return selected;
  }

  const coldStartArtist = currentSong?.providerId === providerId
    ? currentSong.artists?.find((artist) => artist.providerId === providerId)
    : undefined;
  return coldStartArtist
    ? [{ artist: coldStartArtist, score: 0, lastPlayedAt: now }]
    : [];
}

async function loadCandidateGroup(
  providerId: RemoteProviderId,
  seed: ExplorationSeed
): Promise<CandidateGroup> {
  const catalog = useArtistCatalogStore.getState();
  const artist = await catalog.loadArtistDetail(providerId, seed.artist.id);
  if (!artist) {
    return { seed, songs: [] };
  }

  const newestAlbum = selectNewestAlbum(artist);
  const album = newestAlbum
    ? await useArtistCatalogStore.getState().loadAlbumDetail(providerId, newestAlbum.id)
    : null;
  const songs = uniqueProviderSongs(providerId, [
    ...artist.topSongs,
    ...(album?.tracks ?? [])
  ]);

  return { seed, songs };
}

function selectNewestAlbum(artist: ArtistDetail) {
  return [...artist.albums]
    .sort((left, right) => (right.releaseDate ?? '').localeCompare(left.releaseDate ?? '') || left.id.localeCompare(right.id))[0];
}

function selectContinueExplorationSongs(
  groups: readonly CandidateGroup[],
  excluded: ReadonlySet<string>,
  generationKey: string
): Song[] {
  const prepared = groups.map((group) => ({
    ...group,
    songs: group.songs
      .filter((song) => !excluded.has(getSongIdentity(song)))
      .sort((left, right) => (
        stableHash(`${generationKey}:${group.seed.artist.id}:${getSongIdentity(left)}`)
        - stableHash(`${generationKey}:${group.seed.artist.id}:${getSongIdentity(right)}`)
        || getSongIdentity(left).localeCompare(getSongIdentity(right))
      ))
      .slice(0, CONTINUE_EXPLORATION_PER_ARTIST_LIMIT)
  }));
  const selected: Song[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < CONTINUE_EXPLORATION_PER_ARTIST_LIMIT; index += 1) {
    for (const group of prepared) {
      const song = group.songs[index];
      if (!song) {
        continue;
      }
      const identity = getSongIdentity(song);
      if (seen.has(identity)) {
        continue;
      }

      seen.add(identity);
      selected.push(song);
      if (selected.length >= CONTINUE_EXPLORATION_SONG_LIMIT) {
        return selected;
      }
    }
  }

  return selected;
}

function uniqueProviderSongs(providerId: RemoteProviderId, songs: readonly Song[]): Song[] {
  const selected: Song[] = [];
  const seen = new Set<string>();
  for (const song of songs) {
    const identity = getSongIdentity(song);
    if (song.providerId !== providerId || seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    selected.push(song);
  }
  return selected;
}

function createGenerationKey(
  providerId: RemoteProviderId,
  seeds: readonly ExplorationSeed[],
  excludedIdentities: readonly string[],
  now: number
): string {
  const date = new Date(now).toLocaleDateString('en-CA');
  const seedFingerprint = seeds
    .map((seed) => `${seed.artist.id}:${seed.score.toFixed(6)}:${seed.lastPlayedAt}`)
    .sort()
    .join('|');
  return `${date}:${providerId}:${stableHash(seedFingerprint)}:${stableHash(excludedIdentities.join('|'))}`;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createProviderStates(): Record<RemoteProviderId, ContinueExplorationProviderState> {
  return {
    qq: createProviderState(),
    netease: createProviderState()
  };
}

function createProviderState(): ContinueExplorationProviderState {
  return {
    songs: [],
    isLoading: false,
    loaded: false,
    generationKey: null,
    errorMessage: null
  };
}
