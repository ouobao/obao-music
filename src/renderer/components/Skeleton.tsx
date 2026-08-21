interface SkeletonBlockProps {
  width?: number | string;
  height: number | string;
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonBlock({ width = '100%', height, radius, className, style }: SkeletonBlockProps) {
  return (
    <div
      className={`skeleton-block ${className ?? ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ widthRatio = 1, className, style }: { widthRatio?: number; className?: string; style?: React.CSSProperties }) {
  return <SkeletonBlock height={14} width={`${Math.round(widthRatio * 100)}%`} radius="var(--radius-sm)" className={className} style={style} />;
}

export function SkeletonCover({ size = '100%', radius = 'var(--radius-lg)', className }: { size?: number | string; radius?: string; className?: string }) {
  return (
    <SkeletonBlock
      width={size}
      height={size}
      radius={radius}
      className={className}
      style={{ aspectRatio: '1 / 1' }}
    />
  );
}

export function SkeletonSongRow({ rows = 6, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className="song-table" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`song-row ${compact ? 'song-row-without-album' : ''}`}
          style={{ cursor: 'default', pointerEvents: 'none' }}
        >
          <div className="song-index-col"><SkeletonText widthRatio={0.5} /></div>
          <div className="song-title-col">
            <SkeletonBlock width={38} height={38} radius="var(--radius-sm)" />
            <div className="song-row-meta" style={{ flex: 1, gap: 8 }}>
              <SkeletonText widthRatio={0.6} />
              <SkeletonText widthRatio={0.35} />
            </div>
          </div>
          <div className="song-artist-col"><SkeletonText widthRatio={0.5} /></div>
          {!compact && <div className="song-album-col"><SkeletonText widthRatio={0.4} /></div>}
          <div className="song-duration-col"><SkeletonText widthRatio={0.5} /></div>
          <div className="song-actions-col" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6, minColWidth = 180 }: { count?: number; minColWidth?: number }) {
  return (
    <div className="media-grid" aria-hidden="true" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColWidth}px, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div className="media-card" key={i} style={{ gap: 8 }}>
          <SkeletonCover size="100%" />
          <SkeletonText widthRatio={0.7} />
          <SkeletonText widthRatio={0.4} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPills({ count = 8 }: { count?: number }) {
  return (
    <div className="filter-pills-bar" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} width={70 + ((i * 17) % 40)} height={30} radius="var(--radius-pill)" />
      ))}
    </div>
  );
}

export function SkeletonBanner({ height = 180 }: { height?: number }) {
  return (
    <div className="home-banner-grid" aria-hidden="true">
      {[0, 1].map((i) => (
        <SkeletonBlock key={i} height={height} radius="var(--radius-xl)" />
      ))}
    </div>
  );
}
