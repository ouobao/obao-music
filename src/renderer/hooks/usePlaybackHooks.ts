import { useEffect } from 'react';
import { usePlayerStore, songKey } from '../state/playerStore';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';

export function usePlaybackSessionRecovery() {
  useEffect(() => {
    const { queue, currentQueueItemId, queueSongs } = usePlayerStore.getState();
    if (!currentQueueItemId || queue.length === 0) return;

    const item = queue.find((q) => q.id === currentQueueItemId);
    if (!item || item.mediaType !== 'song') return;
    const song = queueSongs[item.mediaId];
    if (!song) return;

    usePlayerStore.setState({
      currentSong: song,
      isPlaying: false,
      playbackStatus: 'idle'
    });
  }, []);
}

export function useQualifiedListenTracking() {
  useEffect(() => {
    let qualifiedSessionId: string | null = null;

    const sessionIdFor = (state: ReturnType<typeof usePlayerStore.getState>) => {
      const song = state.currentSong;
      return song ? `${songKey(song)}:${state.playbackSessionRevision}` : null;
    };

    const check = () => {
      const state = usePlayerStore.getState();
      const song = state.currentSong;
      const sessionId = sessionIdFor(state);
      if (!song || !state.isPlaying || !sessionId) {
        if (!song) qualifiedSessionId = null;
        return;
      }
      if (qualifiedSessionId === sessionId) return;

      const qualifies = state.playbackPositionMs >= 30_000
        || (state.playbackDurationMs > 0 && state.playbackPositionMs >= state.playbackDurationMs * 0.5);
      if (qualifies) {
        useListeningHistoryStore.getState().recordQualifiedListen(song);
        qualifiedSessionId = sessionId;
      }
    };

    const unsubscribe = usePlayerStore.subscribe((state, previousState) => {
      if (sessionIdFor(state) !== sessionIdFor(previousState)) {
        qualifiedSessionId = null;
      }
      check();
    });
    const interval = setInterval(check, 5000);
    check();

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
}
