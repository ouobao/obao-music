import { LoaderCircle, Play } from 'lucide-react';
import type { ReactNode } from 'react';

interface CoverActionSurfaceProps {
  children: ReactNode;
  className?: string;
  openClassName?: string;
  openLabel: string;
  onOpen?: () => void;
  playClassName?: string;
  playLabel: string;
  onPlay?: () => void;
  isPlaying?: boolean;
}

export function CoverActionSurface({
  children,
  className = '',
  openClassName = '',
  openLabel,
  onOpen,
  playClassName = '',
  playLabel,
  onPlay,
  isPlaying = false
}: CoverActionSurfaceProps) {
  return (
    <div className={`cover-action-surface ${className}`.trim()}>
      <button
        className={`cover-action-open ${openClassName}`.trim()}
        type="button"
        aria-label={openLabel}
        title={openLabel}
        disabled={!onOpen}
        onClick={onOpen}
      >
        {children}
      </button>
      <button
        className={`cover-action-play ${playClassName}`.trim()}
        type="button"
        aria-label={isPlaying ? `正在${playLabel}` : playLabel}
        title={isPlaying ? `正在${playLabel}` : playLabel}
        disabled={!onPlay || isPlaying}
        onClick={onPlay}
      >
        {isPlaying
          ? <LoaderCircle className="cover-action-play-loader" aria-hidden="true" size={16} />
          : <Play aria-hidden="true" size={16} fill="currentColor" />}
      </button>
    </div>
  );
}
