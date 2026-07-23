import { useEffect, useMemo, useState } from 'react';
import {
  createCoverPaletteFromTone,
  getCachedCoverPaletteFromImage,
  sampleCoverPaletteFromImage,
  type CoverPalette
} from '../utils/coverPalette';

export function useCoverPalette(coverTone: string, coverUrl?: string): CoverPalette {
  const fallbackPalette = useMemo(() => createCoverPaletteFromTone(coverTone), [coverTone]);
  const sourceKey = `${coverTone}\u0000${coverUrl ?? ''}`;
  const cachedPalette = coverUrl
    ? getCachedCoverPaletteFromImage(coverUrl, fallbackPalette)
    : undefined;
  const [sampledPalette, setSampledPalette] = useState(() => ({
    palette: cachedPalette ?? fallbackPalette,
    sourceKey
  }));
  const coverPalette = cachedPalette
    ?? (sampledPalette.sourceKey === sourceKey ? sampledPalette.palette : fallbackPalette);

  useEffect(() => {
    if (!coverUrl || cachedPalette) {
      return;
    }

    let cancelled = false;

    void sampleCoverPaletteFromImage(coverUrl, fallbackPalette).then((palette) => {
      if (!cancelled) {
        setSampledPalette({ palette, sourceKey });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cachedPalette, coverUrl, fallbackPalette, sourceKey]);

  return coverPalette;
}
