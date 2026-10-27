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
  const totalMinutes = Math.round(entries.reduce((sum, entry) => sum + (entry.song.durationMs ?? 0), 0) / 60000);

  return (
    <div data-reveal data-reveal-order={0}>
      <div className="history-header">
        <div className="page-header-main">
          <span className="page-kicker">我的音乐</span>
          <h1 className="detail-title">最近播放</h1>
          <span className="page-subtitle">
            共 {entries.length} 首歌曲{entries[0] ? ` · 最近更新 ${formatRelativeTime(entries[0].lastPlayedAt)}` : ''}
          </span>
        </div>
        {entries.length > 0 && (
          <button className="section-action-btn history-clear-btn" onClick={clear}>清空历史</button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="history-stats">
          <div className="history-stat-card">
            <span className="history-stat-value">{entries.length}</span>
            <span className="history-stat-label">累计收听曲目</span>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-value">{totalMinutes}</span>
            <span className="history-stat-label">累计时长（分钟）</span>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState title="暂无播放记录" desc="播放歌曲超过 30 秒后会自动记录在这里" />
      ) : (
        <SongTable songs={songs} origin={{ kind: 'history', providerId: sorted[0]?.song.providerId ?? 'local' }} />
      )}
    </div>
  );
}
