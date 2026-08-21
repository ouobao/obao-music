import type { LyricLine } from '../../shared/musicTypes';

const MAX_LRC_BYTES = 512 * 1024;
const MAX_LINES = 5000;
const MAX_TIMESTAMPS_PER_LINE = 8;

export interface ParsedLyrics {
  lines: LyricLine[];
  valid: boolean;
}

function lrcTimestampToMs(match: RegExpMatchArray): number {
  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2] || 0);
  const hundredths = Number(match[3] || 0);
  return minutes * 60000 + seconds * 1000 + hundredths * 10;
}

export function parseLrc(lrc: string): ParsedLyrics {
  if (!lrc || typeof lrc !== 'string') return { lines: [], valid: false };
  if (lrc.length > MAX_LRC_BYTES) return { lines: [], valid: false };

  const rawLines = lrc.split(/\r?\n/);
  if (rawLines.length > MAX_LINES) return { lines: [], valid: false };

  const lines: LyricLine[] = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const timeTagPattern = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    const text = trimmed.replace(timeTagPattern, '').trim();
    if (!text) continue;

    const matches = [...trimmed.matchAll(timeTagPattern)];
    if (matches.length === 0 || matches.length > MAX_TIMESTAMPS_PER_LINE) continue;

    for (const match of matches) {
      const startMs = lrcTimestampToMs(match);
      lines.push({ startMs, text });
    }
  }

  lines.sort((a, b) => a.startMs - b.startMs);
  return { lines, valid: lines.length > 0 };
}

export function findActiveLineIndex(lines: LyricLine[], positionMs: number): number {
  if (lines.length === 0) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].startMs <= positionMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export interface TranslatedLine {
  startMs: number;
  text: string;
}

export function alignTranslation(lines: LyricLine[], tlyric: string): TranslatedLine[] {
  const parsed = parseLrc(tlyric);
  if (!parsed.valid || lines.length === 0) return [];

  const result: TranslatedLine[] = [];
  let lastOriginalIndex = -1;
  const used = new Set<number>();

  for (const tl of parsed.lines) {
    let bestIndex = -1;
    let bestDiff = 1500;
    for (let i = lastOriginalIndex + 1; i < lines.length; i++) {
      if (used.has(i)) continue;
      const diff = Math.abs(lines[i].startMs - tl.startMs);
      if (diff <= bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      } else {
        break;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      lastOriginalIndex = bestIndex;
      result.push({ startMs: lines[bestIndex].startMs, text: tl.text });
    }
  }
  return result;
}
