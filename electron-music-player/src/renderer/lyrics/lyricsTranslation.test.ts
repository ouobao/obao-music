import { describe, expect, it } from 'vitest';
import type { LyricLine } from '../../shared/musicTypes';
import { createTranslationMap } from './lyricsTranslation';

describe('createTranslationMap', () => {
  it('matches the closest unused timestamped translation', () => {
    const lines = createLines([1000, 1050]);
    const translatedLines = [
      { startMs: 1000, text: '译文 A' },
      { startMs: 1000, text: '译文 B' }
    ];

    expect([...createTranslationMap(lines, translatedLines)]).toEqual([
      [1000, '译文 A'],
      [1050, '译文 B']
    ]);
  });

  it('prefers the earlier translation index when timestamps are equally close', () => {
    const lines = createLines([1000]);
    const translatedLines = [
      { startMs: 1100, text: '数组中靠前' },
      { startMs: 900, text: '数组中靠后' }
    ];

    expect(createTranslationMap(lines, translatedLines).get(1000)).toBe('数组中靠前');
  });

  it('includes the 1500ms boundary and prefers it over the same-index fallback', () => {
    const lines = createLines([10_000]);
    const translatedLines = [
      { startMs: 0, text: '同索引回退' },
      { startMs: 11_500, text: '容差边界' }
    ];

    expect(createTranslationMap(lines, translatedLines).get(10_000)).toBe('容差边界');
  });

  it('falls back to the same translation index when no timestamp is close enough', () => {
    const lines = createLines([10_000]);
    const translatedLines = [
      { startMs: 0, text: '同索引回退' },
      { startMs: 11_501, text: '超出容差' }
    ];

    expect(createTranslationMap(lines, translatedLines).get(10_000)).toBe('同索引回退');
  });

  it('uses the plain translation only when no timestamped translation is available', () => {
    const lines = createLines([0, 10_000]);
    const translatedLines = [{ startMs: 0, text: '时间轴译文' }];

    expect(createTranslationMap(lines, translatedLines, ['不应覆盖', '纯文本回退'])).toEqual(
      new Map([
        [0, '时间轴译文'],
        [10_000, '纯文本回退']
      ])
    );
  });

  it('preserves greedy matching semantics for unordered and duplicate timestamps', () => {
    const lines = Array.from({ length: 120 }, (_, index) => ({
      startMs: index * 173,
      text: `原文 ${index}`
    }));
    const translatedLines = Array.from({ length: 95 }, (_, index) => ({
      startMs: ((index * 37) % 61) * 341,
      text: `译文 ${index}`
    }));
    const plainTranslatedLines = lines.map((_, index) => `纯文本 ${index}`);

    expect(createTranslationMap(lines, translatedLines, plainTranslatedLines)).toEqual(
      createLegacyTranslationMap(lines, translatedLines, plainTranslatedLines)
    );
  });
});

function createLines(startTimes: number[]): LyricLine[] {
  return startTimes.map((startMs, index) => ({ startMs, text: `原文 ${index}` }));
}

function createLegacyTranslationMap(
  lines: LyricLine[],
  translatedLines: LyricLine[],
  plainTranslatedLines: string[]
): Map<number, string> {
  const usedTranslationIndexes = new Set<number>();
  const translationsByStartMs = new Map<number, string>();

  lines.forEach((line, lineIndex) => {
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    translatedLines.forEach((translatedLine, index) => {
      if (usedTranslationIndexes.has(index)) {
        return;
      }

      const distance = Math.abs(translatedLine.startMs - line.startMs);
      if (distance <= 1500 && distance < closestDistance) {
        closestIndex = index;
        closestDistance = distance;
      }
    });

    if (closestIndex < 0 && translatedLines[lineIndex] && !usedTranslationIndexes.has(lineIndex)) {
      closestIndex = lineIndex;
    }

    if (closestIndex >= 0) {
      translationsByStartMs.set(line.startMs, translatedLines[closestIndex].text);
      usedTranslationIndexes.add(closestIndex);
      return;
    }

    const plainTranslation = plainTranslatedLines[lineIndex];
    if (plainTranslation) {
      translationsByStartMs.set(line.startMs, plainTranslation);
    }
  });

  return translationsByStartMs;
}
