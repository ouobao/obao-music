import type { CSSProperties } from 'react';
import type { Song } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { CoverImage } from './CoverImage';
import { PlayBadgeIcon } from './icons';

/**
 * 横向歌曲货架：以卡片形式横向铺开一组歌曲，点击即从该首开始播放。
 * 用于首页"新歌速递"等需要更强视觉冲击的区块（替代纵向长列表）。
 */
export function SongShelf({ songs, limit = 12 }: { songs: Song[]; limit?: number }) {
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const items = songs.slice(0, limit);

  if (items.length === 0) return null;

  return (
    <div className="shelf">
      <div className="shelf-track">
        {items.map((song, index) => (
          <div
            key={`${song.providerId}:${song.id}`}
            className="shelf-card"
            style={{ '--i': Math.min(index, 6) } as CSSProperties}
            title={`播放：${song.title} - ${song.artist}`}
            role="button"
            tabIndex={0}
            aria-label={`播放 ${song.title} - ${song.artist}`}
            onClick={() => playSongsFromList(songs, songs.findIndex((s) => s.id === song.id && s.providerId === song.providerId))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playSongsFromList(songs, songs.findIndex((s) => s.id === song.id && s.providerId === song.providerId));
              }
            }}
          >
            <div className="shelf-cover-wrap">
              <CoverImage
                className="shelf-cover"
                src={song.coverUrl}
                tone={song.coverTone}
                size={360}
                fallbackIconSize={30}
              />
              <span className="shelf-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="shelf-play" aria-hidden="true">
                <PlayBadgeIcon size={17} strokeWidth={2} filled />
              </span>
            </div>
            <div className="shelf-title">{song.title}</div>
            <div className="shelf-artist">{song.artist}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
