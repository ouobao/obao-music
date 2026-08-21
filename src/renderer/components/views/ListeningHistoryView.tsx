import { useMemo } from 'react';
import { useListeningHistoryStore } from '../../state/listeningHistoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { SongTable } from '../../components/SongTable';
import { formatRelativeTime } from '../../utils/format';
import { EmptyState } from '../../components/MediaCards';

export function ListeningHistoryView() {
  const entries = useListeningHistoryStore((s) => s.entries);
  const clear = useListeningHistoryStore((s) => s.clear);
  const currentSongId = usePlayerStore((s) => s.currentSong?.id);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.song.id === currentSongId) return -1;
      if (b.song.id === currentSongId) return 1;
      return b.lastPlayedAt - a.lastPlayedAt;
    });
  }, [entries, currentSongId]);

  const songs = sorted.map((entry) => entry.song);

  return (
    <div data-reveal data-reveal-order={0}>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div className="section-title-group">
          <h1 className="detail-title" style={{ fontSize: 22 }}>最近播放记录</h1>
          <span className="section-sub-title">
            共收听 {entries.length} 首歌曲{entries[0] ? ` · 最近更新 ${formatRelativeTime(entries[0].lastPlayedAt)}` : ''}
          </span>
        </div>
        {entries.length > 0 && (
          <button className="section-action-btn" onClick={clear}>清空历史</button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="暂无播放记录" desc="播放歌曲超过 30 秒后会自动记录在这里" />
      ) : (
        <SongTable songs={songs} origin={{ kind: 'history', providerId: sorted[0]?.song.providerId ?? 'local' }} />
      )}
    </div>
  );
}
