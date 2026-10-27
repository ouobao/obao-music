import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MusicNoteIcon } from './icons';
import { toThumbnailUrl } from '../utils/remoteCover';

interface CoverImageProps {
  /** 远端封面地址；为空或加载失败时回退为 coverTone 渐变占位 */
  src?: string;
  /** 占位渐变（歌曲/歌单自带的 coverTone） */
  tone?: string;
  alt?: string;
  className?: string;
  /** 展示尺寸提示：网易云图片会按此尺寸降采样，避免列表拉取原图 */
  size?: number;
  /** 首次打开抽屉等场景：跳过淡入过渡，避免成群动画卡顿 */
  noReveal?: boolean;
  /** 占位图标的字号（列表用小封面时传更小的值） */
  fallbackIconSize?: number;
  style?: CSSProperties;
}

/**
 * 统一封面组件：
 *  - 网易云封面按展示尺寸降采样（size 参数）
 *  - 加载完成/缓存命中时模糊淡入（.img-loaded 契约）
 *  - 加载失败或无地址时回退为 coverTone 渐变 + 音符占位（不出现破图图标）
 *  - 尺寸由外部 CSS 类决定，组件本身不写死宽高，保证列表/卡片复用
 */
export function CoverImage({
  src,
  tone,
  alt = '',
  className,
  size = 300,
  noReveal = false,
  fallbackIconSize = 16,
  style
}: CoverImageProps) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setBroken(false);
    setLoaded(false);
  }, [src]);

  // 缓存命中时 onLoad 可能早于 React 绑定：挂载后补一次 complete 检查
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  const fallbackStyle: CSSProperties = {
    background: tone || 'var(--surface-2)',
    ...style
  };

  if (!src || broken) {
    return (
      <span className={`${className ?? ''} cover-fallback`.trim()} style={fallbackStyle} aria-hidden="true">
        <MusicNoteIcon size={fallbackIconSize} strokeWidth={1.8} />
      </span>
    );
  }

  return (
    <img
      ref={imgRef}
      className={`${className ?? ''} ${noReveal ? 'no-reveal' : ''} ${loaded ? 'img-loaded' : ''}`.trim()}
      src={toThumbnailUrl(src, size)}
      alt={alt}
      loading="lazy"
      draggable={false}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
    />
  );
}
