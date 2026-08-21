import { Maximize2 } from 'lucide-react';
import { memo, useCallback, useRef, type CSSProperties } from 'react';
import { useCoverPalette } from '../hooks/useCoverPalette';
import { createFallbackLyricsTransitionOrigin, toLyricsTransitionOrigin, type LyricsTransitionOrigin } from '../lyrics/lyricsTransition';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import type { CoverPalette } from '../utils/coverPalette';
import type { Song } from '../../shared/musicTypes';
import { PlaybackCoreControls, PlaybackExtras } from './PlayerTransport';

interface PlayerBarProps {
  isSimilarSongsOpen?: boolean;
  onLoginClick?: () => void;
  onLyricsOpen?: (origin: LyricsTransitionOrigin, palette: CoverPalette) => void;
  onSimilarSongsToggle?: (song: Song) => void;
  reduceEffects?: boolean;
}

interface PlaybackBarProps extends PlayerBarProps {
  surface: 'main' | 'lyrics';
}

const fallbackMedia = {
  title: '未播放歌曲',
  artist: '从歌单或搜索结果中选择音乐',
  album: '',
  coverTone: 'linear-gradient(135deg, #d84848, #2f6f90)',
  coverUrl: undefined,
  durationMs: 0
};

export const PlayerBar = memo(function PlayerBar(props: PlayerBarProps) {
  return <PlaybackBar {...props} surface="main" />;
});

export function LyricsPlayerBar({ reduceEffects = false }: Pick<PlayerBarProps, 'reduceEffects'>) {
  return <PlaybackBar surface="lyrics" reduceEffects={reduceEffects} />;
}

function PlaybackBar(_props: PlaybackBarProps) {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const setLyricsOpen = usePlayerStore((state) => state.setLyricsOpen);
  const toggleQueue = useUiStore((state) => state.toggleQueue);
  const coverButtonRef = useRef<HTMLButtonElement | null>(null);

  const isLyricsSurface = _props.surface === 'lyrics';
  const activeSong: Song | null = currentSong;
  const media = activeSong ?? fallbackMedia;
  const mediaSubtitle = activeSong
    ? [activeSong.artist, activeSong.album].filter(Boolean).join(' · ')
    : fallbackMedia.artist;
  const coverPalette = useCoverPalette(media.coverTone, isLyricsSurface ? undefined : media.coverUrl);

  const handleLyricsOpen = useCallback(() => {
    const rect = coverButtonRef.current?.getBoundingClientRect();
    const origin = rect ? toLyricsTransitionOrigin(rect) : createFallbackLyricsTransitionOrigin();

    if (_props.onLyricsOpen) {
      _props.onLyricsOpen(origin, coverPalette);
      return;
    }

    setLyricsOpen(true);
  }, [_props.onLyricsOpen, coverPalette, setLyricsOpen]);

  const handleSimilarToggle = useCallback(() => {
    if (activeSong) {
      _props.onSimilarSongsToggle?.(activeSong);
    }
  }, [_props.onSimilarSongsToggle, activeSong]);

  const coverFrameStyle = {
    '--cover-tone': media.coverTone,
    '--song-cover-image': createCoverImage(media.coverUrl)
  } as CSSProperties;

  return (
    <section
      className={isLyricsSurface ? 'playerbar lyrics-player-bar' : 'playerbar'}
      aria-label={isLyricsSurface ? '歌词页播放栏' : '底部播放栏'}
      data-player-surface={_props.surface}
    >
      <div className="playerbar-left">
        {isLyricsSurface ? (
          <span className="song-cover-wrapper" aria-hidden="true" style={coverFrameStyle}>
            <span className="song-cover-img" />
          </span>
        ) : (
          <button
            className="song-cover-wrapper"
            type="button"
            aria-label={`打开歌词页：${media.title}`}
            style={coverFrameStyle}
            onClick={handleLyricsOpen}
            ref={coverButtonRef}
          >
            <span className="song-cover-img" />
            <span className="song-cover-overlay" aria-hidden="true">
              <Maximize2 size={15} strokeWidth={2.2} />
            </span>
          </button>
        )}
        <div className="song-info-meta">
          <strong className="song-title" title={media.title}>{media.title}</strong>
          <span className="song-artist-album">{mediaSubtitle}</span>
        </div>
      </div>

      <div className="playerbar-center">
        <PlaybackCoreControls />
      </div>

      <div className="playerbar-right">
        <PlaybackExtras onOpenSimilar={handleSimilarToggle} onQueue={toggleQueue} hideSimilar={isLyricsSurface} />
      </div>
    </section>
  );
}

function createCoverImage(coverUrl?: string): string {
  return coverUrl ? `url("${coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))';
}
