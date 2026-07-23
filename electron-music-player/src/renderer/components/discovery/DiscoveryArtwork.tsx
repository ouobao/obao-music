import { Headphones, Music2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RemoteProviderId } from '../../../shared/musicTypes';

interface DiscoveryArtworkProps {
  className?: string;
  coverUrl?: string;
  label: string;
  providerId: RemoteProviderId;
  playCount?: number;
  eager?: boolean;
}

interface DiscoveryCoverPlayButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function DiscoveryArtwork({
  className = '',
  coverUrl,
  label,
  providerId,
  playCount,
  eager = false
}: DiscoveryArtworkProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedCoverUrl = coverUrl?.trim() ?? '';
  const showImage = normalizedCoverUrl.length > 0 && !imageFailed;
  const fallbackLabel = getFallbackLabel(label);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedCoverUrl]);

  return (
    <span
      className={`discovery-artwork ${showImage ? 'discovery-artwork-with-image' : 'discovery-artwork-fallback'} ${className}`.trim()}
      data-artwork-variant={getArtworkVariant(label)}
      data-provider={providerId}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          alt=""
          decoding="async"
          draggable={false}
          loading={eager ? 'eager' : 'lazy'}
          src={normalizedCoverUrl}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="discovery-artwork-fallback-content">
          <Music2 size={20} strokeWidth={1.7} />
          <strong>{fallbackLabel}</strong>
          <small>{providerId === 'qq' ? 'QQ' : '云音乐'}</small>
        </span>
      )}
      {typeof playCount === 'number' && playCount >= 0 ? (
        <span className="discovery-play-count">
          <Headphones size={11} aria-hidden="true" />
          {formatPlayCount(playCount)}
        </span>
      ) : null}
    </span>
  );
}

export function DiscoveryCoverPlayButton({
  label,
  onClick,
  disabled = false,
  className = ''
}: DiscoveryCoverPlayButtonProps) {
  return (
    <button
      className={`discovery-cover-play ${className}`.trim()}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      <Play aria-hidden="true" size={16} fill="currentColor" />
    </button>
  );
}

export function formatPlayCount(playCount: number): string {
  if (!Number.isFinite(playCount) || playCount < 0) {
    return '0';
  }
  if (playCount >= 100_000_000) {
    return `${formatCompactNumber(playCount / 100_000_000)}亿`;
  }
  if (playCount >= 10_000) {
    return `${formatCompactNumber(playCount / 10_000)}万`;
  }
  return Math.floor(playCount).toLocaleString('zh-CN');
}

function formatCompactNumber(value: number): string {
  return value >= 100 ? Math.floor(value).toString() : value.toFixed(1).replace(/\.0$/, '');
}

function getFallbackLabel(label: string): string {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ');
  return normalizedLabel.slice(0, 4) || '音乐';
}

function getArtworkVariant(label: string): string {
  let hash = 0;
  for (const character of label) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return String(hash % 4);
}
