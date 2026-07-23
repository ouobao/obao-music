import type { RemoteProviderId, Song } from '../../shared/musicTypes';
import type { ListeningHistoryEntry } from './listeningHistoryStore';
import { getSongIdentity } from './listeningHistoryStore';

const LONG_TIME_NO_LISTEN_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const LONG_TIME_NO_LISTEN_LIMIT = 12;

export function selectLongTimeNoListenSongs(
  providerId: RemoteProviderId,
  history: readonly ListeningHistoryEntry[],
  excludedSongs: readonly Song[],
  now = Date.now()
): Song[] {
  const excluded = new Set(excludedSongs.map(getSongIdentity));
  const seen = new Set<string>();

  return history
    .filter((entry) => (
      entry.song.providerId === providerId
      && now - entry.lastPlayedAt >= LONG_TIME_NO_LISTEN_MIN_AGE_MS
    ))
    .sort((left, right) => left.lastPlayedAt - right.lastPlayedAt || right.qualifiedPlayCount - left.qualifiedPlayCount)
    .map((entry) => entry.song)
    .filter((song) => {
      const identity = getSongIdentity(song);
      if (excluded.has(identity) || seen.has(identity)) {
        return false;
      }
      seen.add(identity);
      return true;
    })
    .slice(0, LONG_TIME_NO_LISTEN_LIMIT);
}
