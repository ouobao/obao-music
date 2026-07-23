interface LazyCoverImageProps {
  className: string;
  coverUrl?: string;
}

export function LazyCoverImage({ className, coverUrl }: LazyCoverImageProps) {
  const normalizedCoverUrl = coverUrl?.trim();

  if (!normalizedCoverUrl) {
    return <span className={className} aria-hidden="true" />;
  }

  return (
    <img
      className={className}
      src={normalizedCoverUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      aria-hidden="true"
    />
  );
}
