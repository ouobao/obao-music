import { useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import type { PlaybackMode } from '../state/playerTypes';
import { formatDuration, clamp } from '../utils/format';
import { PopoverMenu } from './PopoverMenu';
import {
  ModeListLoopIcon,
  ModeSequenceIcon,
  ModeShuffleIcon,
  ModeSingleLoopIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  SimilarIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMutedIcon
} from './icons';

const MODE_ICONS: Record<PlaybackMode, React.ReactElement> = {
  sequence: <ModeSequenceIcon size={15} strokeWidth={2} />,
  shuffle: <ModeShuffleIcon size={15} strokeWidth={2} />,
  singleLoop: <ModeSingleLoopIcon size={15} strokeWidth={2} />,
  listLoop: <ModeListLoopIcon size={15} strokeWidth={2} />
};

const MODE_LABELS: Record<PlaybackMode, string> = {
  sequence: '顺序播放',
  shuffle: '随机播放',
  singleLoop: '单曲循环',
  listLoop: '列表循环'
};

const QUALITY_LABELS: Record<string, string> = {
  standard: '标准',
  higher: 'HQ',
  exhigh: '极高',
  lossless: '无损'
};

export function PlaybackCoreControls() {
  const playbackMode = usePlayerStore((s) => s.playbackMode);
  const setPlaybackMode = usePlayerStore((s) => s.setPlaybackMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlaying = usePlayerStore((s) => s.togglePlaying);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const playNext = usePlayerStore((s) => s.playNext);
  const playbackPositionMs = usePlayerStore((s) => s.playbackPositionMs);
  const playbackDurationMs = usePlayerStore((s) => s.playbackDurationMs);
  const seekPlayback = usePlayerStore((s) => s.seekPlayback);

  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [progressDragging, setProgressDragging] = useState(false);

  const progress = playbackDurationMs > 0 ? (playbackPositionMs / playbackDurationMs) * 100 : 0;

  const seekFromClientX = (clientX: number) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || playbackDurationMs <= 0) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    seekPlayback(ratio * playbackDurationMs, playbackDurationMs);
  };

  const modeItems = (Object.keys(MODE_LABELS) as PlaybackMode[]).map((mode) => ({
    key: mode,
    label: MODE_LABELS[mode],
    checked: playbackMode === mode,
    onSelect: () => setPlaybackMode(mode)
  }));

  return (
    <>
      <div className="playback-controls">
        <button
          ref={modeTriggerRef}
          className="control-btn"
          title="播放模式"
          aria-label="播放模式"
          aria-haspopup="menu"
          aria-expanded={modeMenuOpen}
          onClick={() => setModeMenuOpen((open) => !open)}
        >
          {MODE_ICONS[playbackMode]}
        </button>
        <PopoverMenu
          open={modeMenuOpen}
          onClose={() => setModeMenuOpen(false)}
          triggerRef={modeTriggerRef}
          position="top"
          align="center"
          ariaLabel="播放模式"
          items={modeItems}
        />

        <button className="control-btn" title="上一首" onClick={playPrevious}>
          <SkipBackIcon size={16} strokeWidth={2} filled />
        </button>
        <button className="control-btn play-primary" title="播放 / 暂停" onClick={togglePlaying}>
          {isPlaying ? <PauseIcon size={16} strokeWidth={2} filled /> : <PlayIcon size={16} strokeWidth={2} filled />}
        </button>
        <button className="control-btn" title="下一首" onClick={playNext}>
          <SkipForwardIcon size={16} strokeWidth={2} filled />
        </button>
      </div>

      <div className="progress-bar-container">
        <span className="time-label">{formatDuration(playbackPositionMs)}</span>
        <div
          ref={progressRef}
          className="slider-track"
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(playbackDurationMs)}
          aria-valuenow={Math.round(playbackPositionMs)}
          aria-valuetext={`${formatDuration(playbackPositionMs)} / ${formatDuration(playbackDurationMs)}`}
          style={{ height: 5 }}
          onPointerDown={(e) => {
            e.preventDefault();
            setProgressDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            seekFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (progressDragging) seekFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            setProgressDragging(false);
            seekFromClientX(e.clientX);
          }}
          onPointerCancel={() => setProgressDragging(false)}
        >
          <div className="slider-progress" style={{ width: `${progress}%` }} />
        </div>
        <span className="time-label">{formatDuration(playbackDurationMs)}</span>
      </div>
    </>
  );
}

export function PlaybackExtras({ onOpenSimilar, onQueue, hideSimilar = false }: { onOpenSimilar: () => void; onQueue?: () => void; hideSimilar?: boolean }) {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playbackQuality = usePlayerStore((s) => s.playbackQuality);
  const setPlaybackQuality = usePlayerStore((s) => s.setPlaybackQuality);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleQueue = useUiStore((s) => s.toggleQueue);

  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const qualityTriggerRef = useRef<HTMLButtonElement>(null);
  const [lastNonNullVolume, setLastNonNullVolume] = useState(() =>
    usePlayerStore.getState().volume > 0 ? usePlayerStore.getState().volume : 58
  );

  const showSimilar = Boolean(currentSong) && currentSong?.providerId === 'netease';

  const toggleMute = () => {
    if (volume === 0) {
      setVolume(lastNonNullVolume);
    } else {
      setLastNonNullVolume(volume);
      setVolume(0);
    }
  };

  const volumeIcon =
    volume === 0 ? <VolumeMutedIcon size={15} strokeWidth={2} /> :
    volume < 50 ? <VolumeLowIcon size={15} strokeWidth={2} /> :
    <VolumeHighIcon size={15} strokeWidth={2} />;

  const qualityItems = Object.entries(QUALITY_LABELS).map(([quality, label]) => ({
    key: quality,
    label,
    checked: playbackQuality === quality,
    onSelect: () => setPlaybackQuality(quality as 'standard' | 'higher' | 'exhigh' | 'lossless')
  }));

  const handleQueue = () => {
    if (onQueue) {
      onQueue();
    } else {
      toggleQueue();
    }
  };

  return (
    <>
      {showSimilar && !hideSimilar && (
        <button className="control-btn" title="相似歌曲推荐" aria-label="相似歌曲推荐" onClick={onOpenSimilar}>
          <SimilarIcon size={16} strokeWidth={2} />
        </button>
      )}

      <button
        ref={qualityTriggerRef}
        className="quality-badge-btn"
        title="播放音质"
        aria-haspopup="menu"
        aria-expanded={qualityMenuOpen}
        onClick={() => setQualityMenuOpen((open) => !open)}
      >
        {QUALITY_LABELS[playbackQuality]}
      </button>
      <PopoverMenu
        open={qualityMenuOpen}
        onClose={() => setQualityMenuOpen(false)}
        triggerRef={qualityTriggerRef}
        position="top"
        align="right"
        ariaLabel="播放音质"
        items={qualityItems}
      />

      <button className="control-btn" title="播放队列" aria-label="播放队列" onClick={handleQueue}>
        <QueueIcon size={17} strokeWidth={2} />
      </button>

      <div className="volume-control-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto' }}>
        <button
          className="control-btn"
          style={{ width: 24, height: 24 }}
          title={volume === 0 ? '取消静音' : '静音'}
          aria-label={volume === 0 ? '取消静音' : '静音'}
          onClick={toggleMute}
        >
          {volumeIcon}
        </button>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={100}
          step={1}
          value={volume}
          aria-label="音量"
          aria-valuetext={`音量 ${volume}%`}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ '--vol': `${volume}%` } as React.CSSProperties}
        />
        <span className="volume-percent-label" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)', minWidth: 28, textAlign: 'left' }}>
          {volume}%
        </span>
      </div>
    </>
  );
}
