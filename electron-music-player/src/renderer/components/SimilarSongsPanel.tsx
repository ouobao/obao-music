import { ListPlus, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Song } from '../../shared/musicTypes';
import type { AnimatedPresenceState } from '../hooks/useAnimatedPresence';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';

interface SimilarSongsPanelProps {
  seedSong: Song;
  songs: Song[];
  isLoading: boolean;
  errorMessage: string | null;
  presenceState?: AnimatedPresenceState;
  onClose: () => void;
  onRefresh: () => void;
  onPlayAll: () => void;
  onPlaySong: (song: Song, index: number) => void;
  onPlayNext: (song: Song) => void;
}

export function SimilarSongsPanel({
  seedSong,
  songs,
  isLoading,
  errorMessage,
  presenceState = 'open',
  onClose,
  onRefresh,
  onPlayAll,
  onPlaySong,
  onPlayNext
}: SimilarSongsPanelProps) {
  const hasSongs = songs.length > 0;
  useAppNotificationValue({
    key: `similar-songs:${seedSong.providerId}:${seedSong.id}`,
    message: errorMessage,
    actionLabel: '重试',
    onAction: onRefresh
  });

  return (
    <aside
      className="similar-songs-panel"
      aria-label="当前歌曲相似推荐"
      aria-busy={isLoading}
      data-state={presenceState}
    >
      <header className="similar-songs-heading">
        <div className="similar-songs-title">
          <Sparkles aria-hidden="true" size={19} />
          <div>
            <h2>相似推荐</h2>
            <p title={seedSong.title}>{seedSong.title}</p>
          </div>
        </div>
        <div className="similar-songs-heading-actions">
          <button
            className="icon-button similar-songs-refresh"
            type="button"
            aria-label="刷新相似推荐"
            title="刷新相似推荐"
            disabled={isLoading}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="关闭相似推荐" title="关闭相似推荐" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      {hasSongs ? (
        <div className="similar-songs-toolbar">
          <span>{songs.length} 首歌曲</span>
          <button className="similar-songs-play-all" type="button" onClick={onPlayAll}>
            <Play aria-hidden="true" size={15} fill="currentColor" />
            <span>播放全部</span>
          </button>
        </div>
      ) : null}

      <div className="similar-songs-content">
        {isLoading ? (
          <p className="similar-songs-message" role="status">正在加载相似推荐</p>
        ) : null}
        {!isLoading && !errorMessage && !hasSongs ? (
          <p className="similar-songs-message">当前歌曲暂无相似推荐</p>
        ) : null}

        {hasSongs ? (
          <div className="similar-songs-list" role="list" aria-label={`与 ${seedSong.title} 相似的歌曲`}>
            {songs.map((song, index) => (
              <div className="similar-song-row" role="listitem" key={`${song.providerId}:${song.platformSongId ?? song.id}`}>
                <span
                  className="similar-song-cover"
                  aria-hidden="true"
                  style={
                    {
                      '--cover-tone': song.coverTone,
                      '--song-cover-image': song.coverUrl
                        ? `url("${song.coverUrl}")`
                        : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                    } as CSSProperties
                  }
                />
                <span className="similar-song-copy">
                  <strong title={song.title}>{song.title}</strong>
                  <small title={`${song.artist} - ${song.album}`}>{song.artist} · {song.album}</small>
                </span>
                <span className="similar-song-duration">{formatDuration(song.durationMs)}</span>
                <span className="similar-song-actions">
                  <button
                    type="button"
                    aria-label={`播放相似歌曲：${song.title}`}
                    title="播放"
                    onClick={() => onPlaySong(song, index)}
                  >
                    <Play aria-hidden="true" size={16} fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    aria-label={`下一首播放：${song.title}`}
                    title="下一首播放"
                    onClick={() => onPlayNext(song)}
                  >
                    <ListPlus aria-hidden="true" size={16} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
