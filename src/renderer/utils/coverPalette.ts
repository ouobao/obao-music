export interface CoverPalette {
  primary: string;
  secondary: string;
  shadow: string;
  tone: string;
}

const resolvedCoverPaletteCache = new Map<string, CoverPalette>();
const coverPaletteRequestCache = new Map<string, Promise<CoverPalette>>();
const MAX_COVER_PALETTE_CACHE_SIZE = 64;

export function createCoverPaletteFromTone(coverTone: string): CoverPalette {
  const colors = extractHexColors(coverTone);
  const primary = colors[0] ?? '#d84848';
  const secondary = colors[1] ?? colors[0] ?? '#2f6f90';

  return createCoverPalette(primary, secondary, 'var(--qq-text)');
}

export async function sampleCoverPaletteFromImage(coverUrl: string, fallbackPalette: CoverPalette): Promise<CoverPalette> {
  const cacheKey = createCoverPaletteCacheKey(coverUrl, fallbackPalette);
  const cachedPalette = getResolvedCoverPalette(cacheKey);

  if (cachedPalette) {
    return cachedPalette;
  }

  const cachedRequest = coverPaletteRequestCache.get(cacheKey);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = new Promise<CoverPalette>((resolve) => {
    try {
      const image = new Image();

      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(readCoverPaletteFromImage(image, fallbackPalette));
      image.onerror = () => resolve(fallbackPalette);
      image.src = coverUrl;
    } catch {
      resolve(fallbackPalette);
    }
  }).then((palette) => {
    coverPaletteRequestCache.delete(cacheKey);
    setResolvedCoverPalette(cacheKey, palette);
    return palette;
  });
  coverPaletteRequestCache.set(cacheKey, request);
  return request;
}

export function getCachedCoverPaletteFromImage(
  coverUrl: string,
  fallbackPalette: CoverPalette
): CoverPalette | undefined {
  return getResolvedCoverPalette(createCoverPaletteCacheKey(coverUrl, fallbackPalette));
}

function createCoverPaletteCacheKey(coverUrl: string, fallbackPalette: CoverPalette): string {
  return `${coverUrl}\u0000${fallbackPalette.primary}\u0000${fallbackPalette.secondary}`;
}

function getResolvedCoverPalette(cacheKey: string): CoverPalette | undefined {
  const palette = resolvedCoverPaletteCache.get(cacheKey);

  if (!palette) {
    return undefined;
  }

  resolvedCoverPaletteCache.delete(cacheKey);
  resolvedCoverPaletteCache.set(cacheKey, palette);
  return palette;
}

function setResolvedCoverPalette(cacheKey: string, palette: CoverPalette): void {
  resolvedCoverPaletteCache.delete(cacheKey);
  resolvedCoverPaletteCache.set(cacheKey, palette);

  while (resolvedCoverPaletteCache.size > MAX_COVER_PALETTE_CACHE_SIZE) {
    const oldestKey = resolvedCoverPaletteCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      return;
    }
    resolvedCoverPaletteCache.delete(oldestKey);
  }
}

export function createCoverPaletteFromPixels(data: Uint8ClampedArray, fallbackPalette: CoverPalette): CoverPalette {
  const buckets = new Map<string, { red: number; green: number; blue: number; score: number }>();

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 255;

    if (alpha < 128) {
      continue;
    }

    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;

    if (lightness < 18 || lightness > 242) {
      continue;
    }

    const saturation = max === 0 ? 0 : (max - min) / max;
    const weight = 1 + saturation * 2;
    const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, score: 0 };

    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    bucket.score += weight;
    buckets.set(key, bucket);
  }

  const colors = Array.from(buckets.values())
    .filter((bucket) => bucket.score > 0)
    .map((bucket) => ({
      color: toHexColor(bucket.red / bucket.score, bucket.green / bucket.score, bucket.blue / bucket.score),
      score: bucket.score
    }))
    .sort((left, right) => right.score - left.score);

  if (colors.length === 0) {
    return fallbackPalette;
  }

  const primary = colors[0].color;
  const secondary = colors.find((entry) => getColorDistance(primary, entry.color) > 54)?.color ?? colors[1]?.color ?? fallbackPalette.secondary;

  return createCoverPalette(primary, secondary);
}

function readCoverPaletteFromImage(image: HTMLImageElement, fallbackPalette: CoverPalette): CoverPalette {
  try {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const sampleWidth = Math.min(32, width);
    const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      return fallbackPalette;
    }

    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    return createCoverPaletteFromPixels(context.getImageData(0, 0, sampleWidth, sampleHeight).data, fallbackPalette);
  } catch {
    return fallbackPalette;
  }
}

function createCoverPalette(primary: string, secondary: string, shadow = primary): CoverPalette {
  return {
    primary,
    secondary,
    shadow,
    tone: `linear-gradient(135deg, ${primary}, ${secondary})`
  };
}

function extractHexColors(value: string): string[] {
  return Array.from(value.matchAll(/#[0-9a-fA-F]{3,8}/g)).map((match) => normalizeHexColor(match[0]));
}

function normalizeHexColor(color: string): string {
  if (color.length === 4) {
    const [, red, green, blue] = color;
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }

  return color.slice(0, 7).toLowerCase();
}

function toHexColor(red: number, green: number, blue: number): string {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function toHexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
}

function getColorDistance(left: string, right: string): number {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);

  return Math.hypot(leftRgb.red - rightRgb.red, leftRgb.green - rightRgb.green, leftRgb.blue - rightRgb.blue);
}

function parseHexColor(color: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16)
  };
}
