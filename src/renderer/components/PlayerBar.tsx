import {
  AudioLines,
  ListOrdered,
  ListMusic,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  type LucideIcon
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties
} from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopoverStyle } from '../hooks/useAnchoredPopoverStyle';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { useCoverPalette } from '../hooks/useCoverPalette';
import { createFallbackLyricsTransitionOrigin, toLyricsTransitionOrigin, type LyricsTransitionOrigin } from '../lyrics/lyricsTransition';
import { usePlayerStore, type PlaybackMode } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import type { CoverPalette } from '../utils/coverPalette';
import type { Quality } from '../../shared/providerTypes';
import type { Program, Song } from '../../shared/musicTypes';
import { ElasticOptionList } from './ElasticOptionList';
import { ElasticVerticalRange } from './ElasticVerticalRange';

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

interface CoverSnapshot {
  songId: string | undefined;
  coverTone: string;
  coverUrl: string | undefined;
}

interface CoverSwapMotionState {
  frontCover: CoverSnapshot;
  backCover: CoverSnapshot;
  isAnimating: boolean;
  revision: number;
}

const qualityOptions: Array<{ value: Quality; label: string }> = [
  { value: 'standard', label: '标准' },
  { value: 'higher', label: '较高' },
  { value: 'exhigh', label: '极高' },
  { value: 'lossless', label: '无损' }
];

const playbackModeOptions: Array<{ value: PlaybackMode; label: string; Icon: LucideIcon }> = [
  { value: 'shuffle', label: '随机播放', Icon: Shuffle },
  { value: 'sequence', label: '顺序播放', Icon: ListOrdered },
  { value: 'singleLoop', label: '单曲循环', Icon: Repeat1 },
  { value: 'listLoop', label: '列表循环', Icon: Repeat2 }
];

const scrollingTitleMinLength = 18;
const coverSwapMotionDurationMs = 520;

export const PlayerBar = memo(function PlayerBar(props: PlayerBarProps) {
  return <PlaybackBar {...props} surface="main" />;
});

export function LyricsPlayerBar({ reduceEffects = false }: Pick<PlayerBarProps, 'reduceEffects'>) {
  return <PlaybackBar surface="lyrics" reduceEffects={reduceEffects} />;
}

function PlaybackBar(_props: PlaybackBarProps) {
  const [isPlaybackModeOpen, setPlaybackModeOpen] = useState(false);
  const [isQualityOpen, setQualityOpen] = useState(false);
  const [isVolumeOpen, setVolumeOpen] = useState(false);
  const playbackModeRef = useRef<HTMLDivElement | null>(null);
  const playbackModePopoverRef = useRef<HTMLDivElement | null>(null);
  const qualityRef = useRef<HTMLDivElement | null>(null);
  const qualityPopoverRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const coverButtonRef = useRef<HTMLButtonElement | null>(null);
  const volumePopoverRef = useRef<HTMLDivElement | null>(null);
  const playbackModePresence = useAnimatedPresence(isPlaybackModeOpen);
  const qualityPresence = useAnimatedPresence(isQualityOpen);
  const volumePresence = useAnimatedPresence(isVolumeOpen);
  const playbackModePopoverStyle = useAnchoredPopoverStyle({
    anchorRef: playbackModeRef,
    gap: 12,
    height: 176,
    open: playbackModePresence.isMounted,
    placement: 'top-center',
    width: 136
  });
  const qualityPopoverStyle = useAnchoredPopoverStyle({
    anchorRef: qualityRef,
    gap: 12,
    height: 168,
    open: qualityPresence.isMounted,
    placement: 'top-center',
    width: 112
  });
  const volumePopoverStyle = useAnchoredPopoverStyle({
    anchorRef: volumeRef,
    gap: 12,
    height: 176,
    open: volumePresence.isMounted,
    placement: 'top-center',
    width: 54
  });
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const playbackQuality = usePlayerStore((state) => state.playbackQuality);
  const playbackPositionMs = usePlayerStore((state) => state.playbackPositionMs);
  const playbackDurationMs = usePlayerStore((state) => state.playbackDurationMs);
  const volume = usePlayerStore((state) => state.volume);
  const togglePlaying = usePlayerStore((state) => state.togglePlaying);
  const playPrevious = usePlayerStore((state) => state.playPrevious);
  const playNext = usePlayerStore((state) => state.playNext);
  const setPlaybackMode = usePlayerStore((state) => state.setPlaybackMode);
  const setPlaybackQuality = usePlayerStore((state) => state.setPlaybackQuality);
  const seekPlayback = usePlayerStore((state) => state.seekPlayback);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setLyricsOpen = usePlayerStore((state) => state.setLyricsOpen);
  const isQueueOpen = useUiStore((state) => state.isQueueOpen);
  const toggleQueue = useUiStore((state) => state.toggleQueue);
  const activeMedia = currentMedia ?? currentSong;
  const currentProgram: Program | null = activeMedia?.mediaType === 'program' ? activeMedia : null;
  const activeSong: Song | null = activeMedia?.mediaType === 'program' ? null : activeMedia ?? null;
  const media = activeMedia ?? {
    title: '未播放歌曲',
    artist: '从歌单或搜索结果中选择音乐',
    album: '',
    coverTone: 'linear-gradient(135deg, #d84848, #2f6f90)',
    coverUrl: undefined,
    durationMs: 0
  };
  const mediaSubtitle = currentProgram
    ? [currentProgram.podcast.title, currentProgram.podcast.author].filter(Boolean).join(' · ')
    : activeSong?.artist ?? '从歌单或搜索结果中选择音乐';
  const isLyricsSurface = _props.surface === 'lyrics';
  const coverPalette = useCoverPalette(media.coverTone, isLyricsSurface ? undefined : media.coverUrl);
  const coverSwap = useCoverSwapMotion({
    songId: activeMedia?.id,
    coverTone: media.coverTone,
    coverUrl: media.coverUrl
  }, !_props.reduceEffects);
  const durationMs = playbackDurationMs || media.durationMs;
  const positionMs = durationMs > 0 ? Math.min(playbackPositionMs, durationMs) : playbackPositionMs;
  const seekMaxMs = Math.max(0, durationMs);
  const seekPositionMs = seekMaxMs > 0 ? positionMs : 0;
  const progressWidth = formatProgressPercent(positionMs, durationMs);
  const shouldScrollSongTitle = media.title.length > scrollingTitleMinLength;
  const currentPlaybackMode = playbackModeOptions.find((option) => option.value === playbackMode) ?? playbackModeOptions[1];
  const PlaybackModeIcon = currentPlaybackMode.Icon;
  const popoverSurfaceClass = isLyricsSurface ? ' lyrics-player-popover' : '';
  const canOpenSimilarSongs = !isLyricsSurface && activeSong?.providerId === 'netease';

  function handlePlaybackModeSelect(mode: PlaybackMode) {
    setPlaybackMode(mode);
  }

  function handleQualitySelect(quality: Quality) {
    setPlaybackQuality(quality);
  }

  function handleProgressSeek(value: string) {
    if (durationMs <= 0) {
      return;
    }

    seekPlayback(Number(value), durationMs);
  }

  function handleLyricsOpen() {
    const rect = coverButtonRef.current?.getBoundingClientRect();
    const origin = rect ? toLyricsTransitionOrigin(rect) : createFallbackLyricsTransitionOrigin();

    if (_props.onLyricsOpen) {
      _props.onLyricsOpen(origin, coverPalette);
      return;
    }

    setLyricsOpen(true);
  }

  function handleCoverSwapAnimationEnd(event: ReactAnimationEvent<HTMLSpanElement>) {
    if (event.target instanceof Element && event.target.classList.contains('cover-thumb-artwork-back')) {
      coverSwap.complete(coverSwap.revision);
    }
  }

  useEffect(() => {
    if (!isPlaybackModeOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const isInsideTrigger = playbackModeRef.current?.contains(target) ?? false;
      const isInsidePopover = playbackModePopoverRef.current?.contains(target) ?? false;

      if (!isInsideTrigger && !isInsidePopover) {
        setPlaybackModeOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPlaybackModeOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaybackModeOpen]);

  useEffect(() => {
    if (!isQualityOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const isInsideTrigger = qualityRef.current?.contains(target) ?? false;
      const isInsidePopover = qualityPopoverRef.current?.contains(target) ?? false;

      if (!isInsideTrigger && !isInsidePopover) {
        setQualityOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setQualityOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isQualityOpen]);

  useEffect(() => {
    if (!isVolumeOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const isInsideTrigger = volumeRef.current?.contains(target) ?? false;
      const isInsidePopover = volumePopoverRef.current?.contains(target) ?? false;

      if (!isInsideTrigger && !isInsidePopover) {
        setVolumeOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setVolumeOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVolumeOpen]);

  useEffect(() => {
    if (currentProgram) {
      setQualityOpen(false);
    }
  }, [currentProgram]);

  return (
    <section
      className={isLyricsSurface ? 'lyrics-player-bar' : 'player-bar'}
      aria-label={isLyricsSurface ? '歌词页播放栏' : '底部播放栏'}
      data-player-surface={_props.surface}
    >
      <div className="now-playing">
        {isLyricsSurface ? (
          <span
            className={coverSwap.isAnimating
              ? 'cover-thumb cover-thumb-layered lyrics-player-cover cover-thumb-song-switching'
              : 'cover-thumb cover-thumb-layered lyrics-player-cover'}
            aria-hidden="true"
            data-song-transition={coverSwap.isAnimating ? 'switching' : undefined}
            style={
              {
                '--cover-tone': media.coverTone,
                '--song-cover-image': createCoverImage(media.coverUrl)
              } as CSSProperties
            }
          >
            <span
              className="cover-thumb-flipper"
              key={`lyrics-player-cover-flipper-${coverSwap.revision}`}
              onAnimationEnd={handleCoverSwapAnimationEnd}
            >
              <span
                className="cover-thumb-artwork cover-thumb-artwork-front"
                style={createCoverArtworkStyle(coverSwap.frontCover)}
              />
              <span
                className="cover-thumb-artwork cover-thumb-artwork-back"
                style={createCoverArtworkStyle(coverSwap.backCover)}
              />
            </span>
          </span>
        ) : currentProgram ? (
          <span
            className={coverSwap.isAnimating
              ? 'cover-thumb cover-thumb-layered cover-thumb-program cover-thumb-song-switching'
              : 'cover-thumb cover-thumb-layered cover-thumb-program'}
            aria-hidden="true"
            data-song-transition={coverSwap.isAnimating ? 'switching' : undefined}
            style={
              {
                '--cover-tone': media.coverTone,
                '--song-cover-image': createCoverImage(media.coverUrl)
              } as CSSProperties
            }
          >
            <span
              className="cover-thumb-flipper"
              key={`player-cover-flipper-${coverSwap.revision}`}
              onAnimationEnd={handleCoverSwapAnimationEnd}
            >
              <span
                className="cover-thumb-artwork cover-thumb-artwork-front"
                style={createCoverArtworkStyle(coverSwap.frontCover)}
              />
              <span
                className="cover-thumb-artwork cover-thumb-artwork-back"
                style={createCoverArtworkStyle(coverSwap.backCover)}
              />
            </span>
          </span>
        ) : (
          <button
            className={coverSwap.isAnimating
              ? 'cover-thumb cover-thumb-layered cover-thumb-button cover-thumb-song-switching'
              : 'cover-thumb cover-thumb-layered cover-thumb-button'}
            type="button"
            data-song-transition={coverSwap.isAnimating ? 'switching' : undefined}
            aria-label={`打开歌词页：${media.title}`}
            style={
              {
                '--cover-tone': media.coverTone,
                '--song-cover-image': createCoverImage(media.coverUrl)
              } as CSSProperties
            }
            onClick={handleLyricsOpen}
            ref={coverButtonRef}
          >
            <span
              className="cover-thumb-flipper"
              key={`player-cover-flipper-${coverSwap.revision}`}
              onAnimationEnd={handleCoverSwapAnimationEnd}
            >
              <span
                className="cover-thumb-artwork cover-thumb-artwork-front"
                aria-hidden="true"
                style={createCoverArtworkStyle(coverSwap.frontCover)}
              />
              <span
                className="cover-thumb-artwork cover-thumb-artwork-back"
                aria-hidden="true"
                style={createCoverArtworkStyle(coverSwap.backCover)}
              />
            </span>
          </button>
        )}
        <div className="now-playing-meta">
          <strong
            className={shouldScrollSongTitle ? 'now-playing-title now-playing-title-scroll' : 'now-playing-title'}
            title={media.title}
          >
            <span className="now-playing-title-track">
              <span>{media.title}</span>
              <span className="now-playing-title-duplicate" aria-hidden="true">{media.title}</span>
            </span>
          </strong>
          <small>{mediaSubtitle}</small>
        </div>
      </div>

      <div className="transport">
        <div className="transport-buttons">
          <div className="playback-mode-menu" ref={playbackModeRef}>
            <button
              className="icon-button playback-mode-trigger"
              type="button"
              aria-label={`${isPlaybackModeOpen ? '收起' : '打开'}播放模式菜单：${currentPlaybackMode.label}`}
              aria-expanded={isPlaybackModeOpen}
              onClick={() => {
                setPlaybackModeOpen((open) => !open);
                setQualityOpen(false);
                setVolumeOpen(false);
              }}
            >
              <PlaybackModeIcon aria-hidden="true" size={18} />
            </button>
            {playbackModePresence.isMounted && typeof document !== 'undefined' ? createPortal(
              <ElasticOptionList
                className={`playback-mode-popover glass-surface${popoverSurfaceClass}`}
                ariaLabel="播放模式"
                dataState={playbackModePresence.state}
                containerRef={playbackModePopoverRef}
                style={playbackModePopoverStyle}
                options={playbackModeOptions}
                value={playbackMode}
                optionClassName="playback-mode-option"
                activeClassName="playback-mode-option-active"
                onChange={handlePlaybackModeSelect}
                onMotionComplete={() => setPlaybackModeOpen(false)}
                renderOption={(option) => (
                  <>
                    <option.Icon aria-hidden="true" size={16} />
                    <span>{option.label}</span>
                  </>
                )}
              />,
              document.body
            ) : null}
          </div>
          <button className="icon-button" type="button" aria-label="上一首" onClick={playPrevious}>
            <SkipBack aria-hidden="true" size={19} />
          </button>
          <button className="play-button" type="button" aria-label={isPlaying ? '暂停' : '播放'} onClick={togglePlaying}>
            {isPlaying ? <Pause aria-hidden="true" size={20} fill="currentColor" /> : <Play aria-hidden="true" size={20} fill="currentColor" />}
          </button>
          <button className="icon-button" type="button" aria-label="下一首" onClick={playNext}>
            <SkipForward aria-hidden="true" size={19} />
          </button>
          <div className="volume-menu" ref={volumeRef}>
            <button
              className="icon-button volume-trigger"
              type="button"
              aria-label={isVolumeOpen ? '收起音量调节' : '打开音量调节'}
              aria-expanded={isVolumeOpen}
              onClick={() => {
                setVolumeOpen((open) => !open);
                setPlaybackModeOpen(false);
                setQualityOpen(false);
              }}
            >
              <Volume2 aria-hidden="true" size={18} />
            </button>
            {volumePresence.isMounted && typeof document !== 'undefined' ? createPortal(
              <div
                className={`volume-popover glass-surface${popoverSurfaceClass}`}
                role="dialog"
                aria-label="音量调节"
                data-state={volumePresence.state}
                ref={volumePopoverRef}
                style={volumePopoverStyle}
              >
                <ElasticVerticalRange
                  className="volume-slider"
                  min={0}
                  max={100}
                  value={volume}
                  aria-label="音量"
                  aria-orientation="vertical"
                  surfaceRef={volumePopoverRef}
                  onValueChange={setVolume}
                />
                <span className="volume-value" aria-hidden="true">
                  {volume}%
                </span>
              </div>,
              document.body
            ) : null}
          </div>
        </div>
        <div className="progress-line">
          <span>{formatDuration(positionMs)}</span>
          <div>
            <i style={{ width: progressWidth }} />
            <input
              type="range"
              min={0}
              max={seekMaxMs}
              value={seekPositionMs}
              aria-label="播放进度"
              aria-valuetext={`${formatDuration(seekPositionMs)} / ${formatDuration(durationMs)}`}
              disabled={durationMs <= 0}
              onChange={(event) => handleProgressSeek(event.currentTarget.value)}
            />
          </div>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>

      <div className="player-actions">
        {canOpenSimilarSongs && activeSong ? (
          <button
            className={_props.isSimilarSongsOpen
              ? 'icon-button similar-songs-toggle-button similar-songs-toggle-active'
              : 'icon-button similar-songs-toggle-button'}
            type="button"
            title="相似推荐"
            aria-label={`${_props.isSimilarSongsOpen ? '收起' : '打开'}当前歌曲相似推荐：${activeSong.title}`}
            aria-pressed={_props.isSimilarSongsOpen ?? false}
            onClick={() => {
              setPlaybackModeOpen(false);
              setQualityOpen(false);
              setVolumeOpen(false);
              _props.onSimilarSongsToggle?.(activeSong);
            }}
          >
            <Sparkles aria-hidden="true" size={18} />
          </button>
        ) : null}
        {!currentProgram ? <div className="quality-menu" ref={qualityRef}>
          <button
            className="icon-button quality-trigger"
            type="button"
            aria-label={isQualityOpen ? '收起音质调节' : '打开音质调节'}
            aria-expanded={isQualityOpen}
            onClick={() => {
              setQualityOpen((open) => !open);
              setPlaybackModeOpen(false);
              setVolumeOpen(false);
            }}
          >
            <AudioLines aria-hidden="true" size={18} />
          </button>
          {qualityPresence.isMounted && typeof document !== 'undefined' ? createPortal(
            <ElasticOptionList
              className={`quality-popover glass-surface${popoverSurfaceClass}`}
              ariaLabel="音质调节"
              dataState={qualityPresence.state}
              containerRef={qualityPopoverRef}
              style={qualityPopoverStyle}
              options={qualityOptions}
              value={playbackQuality}
              optionClassName="quality-option"
              activeClassName="quality-option-active"
              onChange={handleQualitySelect}
              onMotionComplete={() => setQualityOpen(false)}
              renderOption={(option) => option.label}
            />,
            document.body
          ) : null}
        </div> : null}
        <button
          className={isQueueOpen ? 'icon-button queue-toggle-button queue-toggle-active' : 'icon-button queue-toggle-button'}
          type="button"
          aria-label={isQueueOpen ? '收起播放队列' : '展开播放队列'}
          aria-pressed={isQueueOpen}
          onClick={toggleQueue}
        >
          <ListMusic aria-hidden="true" size={18} />
        </button>
      </div>
    </section>
  );
}

function useCoverSwapMotion(currentCover: CoverSnapshot, enabled: boolean) {
  const latestCoverRef = useRef(currentCover);
  const [motion, setMotion] = useState<CoverSwapMotionState>(() => ({
    frontCover: currentCover,
    backCover: currentCover,
    isAnimating: false,
    revision: 0
  }));

  const complete = useCallback((revision: number) => {
    setMotion((currentMotion) => (
      currentMotion.isAnimating && currentMotion.revision === revision
        ? {
            ...currentMotion,
            frontCover: currentMotion.backCover,
            isAnimating: false
          }
        : currentMotion
    ));
  }, []);

  useLayoutEffect(() => {
    const previousCover = latestCoverRef.current;
    const nextCover: CoverSnapshot = {
      songId: currentCover.songId,
      coverTone: currentCover.coverTone,
      coverUrl: currentCover.coverUrl
    };
    const songChanged = previousCover.songId !== nextCover.songId;
    const artworkChanged = !areCoverSnapshotsEqual(previousCover, nextCover);
    latestCoverRef.current = nextCover;

    if (!songChanged) {
      if (!enabled) {
        setMotion((currentMotion) => settleCoverMotion(currentMotion, nextCover));
        return;
      }

      if (artworkChanged) {
        setMotion((currentMotion) => (
          currentMotion.isAnimating
            ? { ...currentMotion, backCover: nextCover }
            : settleCoverMotion(currentMotion, nextCover)
        ));
      }
      return;
    }

    if (!enabled || previousCover.songId === undefined || nextCover.songId === undefined) {
      setMotion((currentMotion) => settleCoverMotion(currentMotion, nextCover));
      return;
    }

    setMotion((currentMotion) => ({
      frontCover: previousCover,
      backCover: nextCover,
      isAnimating: true,
      revision: currentMotion.revision + 1
    }));
  }, [currentCover.coverTone, currentCover.coverUrl, currentCover.songId, enabled]);

  useEffect(() => {
    if (!motion.isAnimating) {
      return undefined;
    }

    const activeRevision = motion.revision;
    const timeoutId = window.setTimeout(() => {
      complete(activeRevision);
    }, coverSwapMotionDurationMs + 40);

    return () => window.clearTimeout(timeoutId);
  }, [complete, motion.isAnimating, motion.revision]);

  return { ...motion, complete };
}

function settleCoverMotion(currentMotion: CoverSwapMotionState, cover: CoverSnapshot): CoverSwapMotionState {
  if (
    !currentMotion.isAnimating
    && areCoverSnapshotsEqual(currentMotion.frontCover, cover)
    && areCoverSnapshotsEqual(currentMotion.backCover, cover)
  ) {
    return currentMotion;
  }

  return {
    ...currentMotion,
    frontCover: cover,
    backCover: cover,
    isAnimating: false
  };
}

function areCoverSnapshotsEqual(first: CoverSnapshot, second: CoverSnapshot): boolean {
  return first.songId === second.songId
    && first.coverTone === second.coverTone
    && first.coverUrl === second.coverUrl;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatProgressPercent(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) {
    return '0%';
  }

  const percent = Math.max(0, Math.min(100, (positionMs / durationMs) * 100));
  return `${Math.round(percent * 100) / 100}%`;
}

function createCoverImage(coverUrl?: string): string {
  return coverUrl ? `url("${coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))';
}

function createCoverArtworkStyle(cover: CoverSnapshot): CSSProperties {
  return {
    '--cover-tone': cover.coverTone,
    '--song-cover-image': createCoverImage(cover.coverUrl)
  } as CSSProperties;
}
