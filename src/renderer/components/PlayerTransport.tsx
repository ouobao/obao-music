import { useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import type { PlaybackMode } from '../state/playerTypes';
import { formatDuration, clamp } from '../utils/format';
import { PopoverMenu } from './PopoverMenu';
import {
  LyricsIcon,
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
  sequence: <ModeSequenceIcon size={17} strokeWidth={2.1} />,
  shuffle: <ModeShuffleIcon size={17} strokeWidth={2.1} />,
  singleLoop: <ModeSingleLoopIcon size={17} strokeWidth={2.1} />,
  listLoop: <ModeListLoopIcon size={17} strokeWidth={2.1} />
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
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false);
  const volumeTriggerRef = useRef<HTMLButtonElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [progressDragging, setProgressDragging] = useState(false);
  const [lastNonNullVolume, setLastNonNullVolume] = useState(() =>
    usePlayerStore.getState().volume > 0 ? usePlayerStore.getState().volume : 58
  );

  const volumeIcon =
    volume === 0 ? <VolumeMutedIcon size={17} strokeWidth={2.1} /> :
    volume <= 50 ? <VolumeLowIcon size={17} strokeWidth={2.1} /> :
    <VolumeHighIcon size={17} strokeWidth={2.1} />;

  const toggleMute = () => {
    if (volume === 0) {
      setVolume(lastNonNullVolume);
    } else {
      setLastNonNullVolume(volume);
      setVolume(0);
    }
  };

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
          <SkipBackIcon size={18} strokeWidth={0} filled />
        </button>
        <button className="control-btn play-primary" title="播放 / 暂停" onClick={togglePlaying}>
          {isPlaying ? <PauseIcon size={19} strokeWidth={0} filled /> : <PlayIcon size={19} strokeWidth={0} filled />}
        </button>
        <button className="control-btn" title="下一首" onClick={playNext}>
          <SkipForwardIcon size={18} strokeWidth={0} filled />
        </button>

        {/* 音量保持在中间控制组，与左侧模式/上一首、右侧下一首形成
            对称的 2+2 布局，播放键才会落在窗口正中；右侧功能区保留歌词/音质/队列。 */}
        <button
          ref={volumeTriggerRef}
          className="control-btn"
          title="音量"
          aria-label="音量"
          aria-haspopup="dialog"
          aria-expanded={volumeMenuOpen}
          onClick={() => setVolumeMenuOpen((open) => !open)}
        >
          {volumeIcon}
        </button>
        <PopoverMenu
          open={volumeMenuOpen}
          onClose={() => setVolumeMenuOpen(false)}
          triggerRef={volumeTriggerRef}
          position="top"
          align="center"
          className="popover-menu--volume"
          ariaLabel="音量调节"
        >
          <div className="volume-popover">
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
            <span className="volume-percent-label">{volume}%</span>
            <button
              className="volume-popover-mute"
              type="button"
              title={volume === 0 ? '取消静音' : '静音'}
              onClick={toggleMute}
            >
              {volumeIcon}
            </button>
          </div>
        </PopoverMenu>
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

export function PlaybackExtras({
  onOpenSimilar,
  onOpenLyrics,
  onQueue,
  hideSimilar = false
}: {
  onOpenSimilar: () => void;
  onOpenLyrics?: () => void;
  onQueue?: () => void;
  hideSimilar?: boolean;
}) {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playbackQuality = usePlayerStore((s) => s.playbackQuality);
  const setPlaybackQuality = usePlayerStore((s) => s.setPlaybackQuality);
  const toggleQueue = useUiStore((s) => s.toggleQueue);

  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const qualityTriggerRef = useRef<HTMLButtonElement>(null);

  const showSimilar = Boolean(currentSong) && currentSong?.providerId === 'netease';

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
      {onOpenLyrics && (
        <button className="control-btn" title="歌词" aria-label="打开歌词页" onClick={onOpenLyrics}>
          <LyricsIcon size={18} strokeWidth={1.9} />
        </button>
      )}

      {showSimilar && !hideSimilar && (
        <button className="control-btn playerbar-similar-btn" title="相似歌曲推荐" aria-label="相似歌曲推荐" onClick={onOpenSimilar}>
          <SimilarIcon size={17} strokeWidth={2.1} />
        </button>
      )}

      <button
        ref={qualityTriggerRef}
        className="quality-badge-btn"
        title="播放音质"
        aria-label="播放音质"
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
        <QueueIcon size={19} strokeWidth={2.1} />
      </button>
    </>
  );
}
